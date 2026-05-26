/** searchResults
 * Searches for anime/shows/movies based on a keyword.
 * @param {string} keyword - The search keyword.
 * @returns {Promise<string>} - A JSON string of search results.
 */
async function searchResults(keyword) {
    try {
        const search_base = 'https://reanime.to/api/search?limit=10&q='
        const encodedKeyword = encodeURIComponent(keyword);
        const responseText = await soraFetch(`${search_base}${encodedKeyword}`);
        const text = await responseText.text();
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
        
        const descriptionRegex = /description:"([^"]+)"/i;
        const durationRegex = /duration:(\d+)/i;
        const synonymsRegex = /synonyms:(\[[^\]]+\])/i;
        const formatRegex = /format:"([^"]+)"/i

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
            durationStr = 'Duration: ' + durationMatch[1];
        }

        let formatStr = 'Format: Unknown'
        if (formatMatch) {
            formatStr = 'Format: ' + formatMatch[1] ;
        }

        let isMovie = formatMatch && (formatMatch[1].includes("ovie") || formatMatch[1].includes("pecial"));

        const transformedResults = [{
            description: description,
            aliases: formatStr,
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
        const match = url.match(/https:\/\/reanime\.to\/anime\/([^/?]+)/i);
        const encodedID = match[1];

        
        const responseText = await soraFetch('https://reanime.to/api/episodes/' + encodedID);
        const text = await responseText.text();
        const data = JSON.parse(text);

        const episodesList = [];

        data.data.forEach(ep => {
            const num = parseInt(ep.episode_number, 10);
            const destinationLink = 'https://reanime.to/watch/' + encodedID + '?ep=' + num;
            episodesList.push({
                href: destinationLink,
                number: num
            })
        })

        return JSON.stringify(episodesList);
        
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
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:150.0) Gecko/20100101 Firefox/150.0',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Referer': 'https://reanime.to/'
        };

        const pageResponse = await soraFetch(url, { headers: headers, method: 'GET' });
        const html = await pageResponse.text();

        const anilistIdRegex = /anilist_id:(\d+)/i;
        const anilistMatch = html.match(anilistIdRegex);
        if (!anilistMatch) {
            console.log("[Stream Extractor] Could not locate the AniList ID required for the API request.");
            return JSON.stringify({ streams: [] });
        }
        const anilistId = anilistMatch[1];

        const epNumMatch = url.match(/[?&]ep=(\d+)/i);
        if (!epNumMatch) {
            console.log("[Stream Extractor] Could not locate episode number in the URL.");
            return JSON.stringify({ streams: [] });
        }
        const episodeNum = epNumMatch[1];

        const apiUrl = `https://reanime.to/api/flix/${anilistId}/${episodeNum}`;
        console.log(`[Stream Extractor] Calling video API: ${apiUrl}`);

        const apiHeaders = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:150.0) Gecko/20100101 Firefox/150.0',
            'Accept': 'application/json, text/plain, */*',
            'Referer': url,
            'X-Requested-With': 'XMLHttpRequest'
        };

        const apiResponse = await soraFetch(apiUrl, { headers: apiHeaders, method: 'GET' });
        if (!apiResponse) return JSON.stringify({ streams: [] });
        
        const apiData = await apiResponse.json();

        if (apiData && apiData.success && apiData.servers && apiData.servers.length > 0) {
            let streams = [];   
            apiData.servers.forEach(server => { 
                streams.push ({
                    title: (server.serverName || "Unnamed Server") + "(" + server.dataType + ")",
                    streamUrl: server.dataLink.replace(/\\/g, ''),
                    headers: {}
                });
            });
            streams.push ({
                title: "TEST",
                streamUrl: "https://flixcloud.cc/api/m3u8/798e73bd9d49054c23df7e2d",
                headers: {}
            });
            return JSON.stringify({streams});
        }

        console.log("[Stream Extractor] API call succeeded, but no valid servers were found in the response.");
        return JSON.stringify({ streams: [] });
    } catch (error) {
        console.log('Error encountered inside extractStreamUrl framework execution: ' + error.message);
        return JSON.stringify({ streams: [] });
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