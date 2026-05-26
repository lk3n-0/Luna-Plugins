/** searchResults
 * Searches for anime/shows/movies based on a keyword.
 * @param {string} keyword - The search keyword.
 * @returns {Promise<string>} - A JSON string of search results.
 */
async function searchResults(keyword) {
    try {
        const search_base = 'https://reanime.to/api/search?limit=36&q='
        const encodedKeyword = encodeURIComponent(keyword);
        const responseText = await soraFetch(`${search_base}${encodedKeyword}`);
        const text = await responseText.text();
        console.log(text);
        const data = JSON.parse(text);
        
        const transformedResults = data.results.map(anime => ({
            title: anime.title.english,
            image: anime.cover_image.large,
            href: `https://reanime.to/anime/${anime.anime_id}`
        }));
        
        return JSON.stringify(transformedResults);
        
    } catch (error) {
        console.log('(search) Fetch error: ' + error.message);
        return JSON.stringify([{ title: 'Error', image: '', href: '' }]);
    }
}

/** extractDetails
 * Extracts details of an anime from its page URL.
 * @param {string} url - The URL of the anime page.
 * @returns {Promise<string>} - A JSON string of the anime details.
 */
async function extractDetails(url) {
    try {
        const response = await soraFetch(url);
        const html = await response.text();
        
        const descriptionRegex = /"description":"([^"]+)"/i;
        const durationRegex = /"duration":(\d+)/i;
        const synonymsRegex = /"synonyms":(\[[^\]]+\])/i;
        const formatRegex = /"format":"([^"]+)"/i

        const descriptionMatch = html.match(descriptionRegex);
        const durationMatch = html.match(durationRegex);
        const synonymsMatch = html.match(synonymsRegex);
        const formatMatch = html.match(formatRegex);

        let description = 'No description available';
        if (descriptionMatch) {
            description = descriptionMatch[1]
                .replace(/\\n/g, '\n')       // Convert literal escaped \n to real newlines
                .replace(/\\u003Cbr>/g, '')  // Strip custom Svelte HTML line break tags (<br>)
                .replace(/\\"/g, '"');       // Clean up escaped quotation marks
        }

        let durationStr = 'Duration: Unknown';
        if (durationMatch) {
            durationStr = 'Duration: ' + durationMatch[1] + ' min';
        }

        let aliasStr = 'Aliases: N/A';
        if (synonymsMatch) {
            try {
                const aliasesArray = JSON.parse(synonymsMatch[1]);
                if (aliasesArray && aliasesArray.length > 0) {
                    aliasStr = 'Also Known As: ' + aliasesArray.join(', ');
                }
            } catch (jsonErr) {
                console.log('Failed parsing synonyms array: ' + jsonErr);
            }
        }

        let isMovie = formatMatch && formatMatch[1].includes("ovie");

        const transformedResults = [{
            description: description,
            aliases: aliasStr,
            airdate: `${durationStr} ${isMovie ? "mins" : "eps"}`
        }];
        
        return JSON.stringify(transformedResults);
    } catch (error) {
        console.log('Details error:' + error.message);
        return JSON.stringify([{
        description: 'Error loading description',
        aliases: 'Duration: Unknown',
        airdate: 'Aired: Unknown'
        }]);
  }
}

/** extractEpisodes
 * Extracts episodes of an anime from its page URL.
 * @param {string} url - The URL of the anime page.
 * @returns {Promise<string>} - A JSON string of the anime episodes.
 */
async function extractEpisodes(url) {
    try {
        const match = url.match(/https:\/\/reanime\.to\/anime\/(.+)$/);
        const encodedID = match[1];
        const response = await soraFetch(`https://reanime.to/watch/${encodedID}?ep=1`);
        const html = await response.text();

        const episodesList = [];

        const masterEpisodesRegex = /"episodes":\s*(\{[\s\S]*?"data":\s*\[[\s\S]*?\]\s*\})/i;
        const jsonMatch = html.match(masterEpisodesRegex);

        if (jsonMatch) {
            const parsedContainer = JSON.parse(jsonMatch[1]);
            const rawEpisodesArray = parsedContainer.data || [];

            rawEpisodesArray.forEach(ep => {
                const epNum = parseInt(ep.episode_number, 10);
                const epId = ep.episodeId || ('ep-' + epNum); // Fallback to ep-X string if missing

                const destinationLink = 'https://reanime.to/watch/' + encodedID + '?ep=' + epId;

                episodesList.push({
                    href: destinationLink,
                    number: epNum
                });
            });
        }
        
        return JSON.stringify(transformedResults);
        
    } catch (error) {
        console.log('Error inside extractEpisodes block handler: ' + error.message);
        return JSON.stringify([]);
    }    
}

/** extractStreamUrl
 * Extracts the stream URL of an anime episode from its page URL.
 * @param {string} url - The URL of the anime episode page.
 * @returns {Promise<string|null>} - The stream URL or null if not found.
 */
async function extractStreamUrl(url) {
    try {
       const match = url.match(/https:\/\/your-source\.com\/watch\/(.+)$/);
       const encodedID = match[1];
       const response = await soraFetch(`https://api.your-source.com/episode/sources?animeEpisodeId=${encodedID}&category=dub`);
       const data = JSON.parse(response);
       
       const hlsSource = data.data.sources.find(source => source.type === 'hls');
       
       return hlsSource ? hlsSource.url : null;
    } catch (error) {
       console.log('(stream) Fetch error: ' + error.message);
       return null;
    }
}


/** Fetch function that tries to use a custom fetch implementation first,
 * and falls back to the native fetch if it fails.
 * @param {string} url - The URL to fetch.
 * @param {Object} options - The options for the fetch request.
 * @returns {Promise<Response|null>} - The response object or null if an error occurs.
 * @note This function is designed to provide Node.js compatibility
 */
async function soraFetch(url, options = { headers: {}, method: 'GET', body: null }) {
    try {
        return await fetchv2(url, options.headers ?? {}, options.method ?? 'GET', options.body ?? null);
    } catch(e) {
        try {
            return await fetch(url, options);
        } catch(error) {
            await console.log('soraFetch error: ' + error.message);
            return null;
        }
    }
}