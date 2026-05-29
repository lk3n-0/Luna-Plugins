/** extractDetails
 * Extracts details of an anime from its page URL.
 * @param {string} url - The URL of the anime page.
 * @returns {Promise<string>} - A JSON string of the anime details.
 */
async function searchResults(keyword) {
    try {
        const encodedKeyword = encodeURIComponent(keyword);
        const response = await soraFetch(`https://ridomovies.is/api/search?q=${encodedKeyword}&lang=en&limit=10`);
        const data = await response.json();
        const transformedResults = data.data.map(media => ({
            title: `${media.title}`,
            image: `https://ridomovies.is/${media.poster_path}`,
            href: `https://ridomovies.is/${media.type}/${media.slug}`
        }));
        return JSON.stringify(transformedResults);
    } catch (error) {
        console.log('(searchResults) Fetch error: ' + error);
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
        const html = response;
        
        const descriptionRegex = /overview[\s\S]+?>([\s\S]*?)<\/div/i;
        const durationRegex = /<strong>Duration:<\/strong> ([\s\S]*?)<\/span>/i;
        const airdateRegex = /class="year-link">([\s\S]*?)</i;

        const descriptionMatch = html.match(descriptionRegex);
        const durationMatch = html.match(durationRegex);
        const airdateMatch = html.match(airdateRegex);

        const transformedResults = [{
            description: descriptionMatch ? descriptionMatch[1].trim() : 'No description available.',
            aliases: `Duration: ${durationMatch ? durationMatch[1] : 'Unknown'}`,
            airdate: `Aired: ${airdateMatch ? airdateMatch[1] : 'Unknown'}`
        }];
        
        return JSON.stringify(transformedResults);
    } catch (error) {
        console.log('(extractDetails) Details error: ' + error);
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
        let response = await soraFetch(url);
        let html = response;
    
        const seasonCountRegex = /"numberOfSeasons":\s*([\d]+)/i;
        const seasonCountMatch = html.match(seasonCountRegex);
        
        let episodes = [];
        
        // Check if it's a TV Show (has seasons) or a Movie
        if (seasonCountMatch && seasonCountMatch[1]) {
            let seasonCount = parseInt(seasonCountMatch[1]);
            const episodeRegex = /<a href="([^"]+)"/gi;
            
            for (let i = 1; i <= seasonCount; i++) {            
                let seasonResponse = await soraFetch(`${url}/season-${i}`);
                // Correctly parse JSON from the response object
                const data = await seasonResponse.json(); 
                
                // Correctly iterate over matchAll results
                const matches = data.episodesHtml.matchAll(episodeRegex);
                for (const ep of matches) {
                    episodes.push(ep[1]);
                }
            }
        } else {
            // It's a Movie. Just return the movie URL as episode 1.
            episodes.push(url);
        }

        const transformedResults = episodes.map((episodeLink, i) => ({
            href: episodeLink,
            number: i + 1
        }));
        
        return JSON.stringify(transformedResults);
    } catch (error) {
        console.log('(extractEpisodes) Fetch error: ' + error);
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
        // STEP 1: Fetch the Ridomovies page to find the iframe
        const ridoResponse = await soraFetch(url);
        const ridoHtml = ridoResponse;
        
        // Extract the closeload iframe URL from the data-src attribute
        const iframeMatch = ridoHtml.match(/<iframe data-src="([^"]+)"/);
        if (!iframeMatch || !iframeMatch[1]) {
            throw new Error("Could not find closeload iframe on page.");
        }
        
        let embedUrl = iframeMatch[1];
        // Ensure the URL is absolute
        if (embedUrl.startsWith('/')) embedUrl = 'https:' + embedUrl;

        // STEP 2: Fetch the Closeload embed page with anti-hotlinking headers
        const embedResponse = await soraFetch(embedUrl, {
            headers: {
                "Referer": "https://ridomovies.is/", 
                "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15",
                "Accept-Language": "en-US,en;q=0.9"
            }
        });
        
        const embedHtml = embedResponse;
        
        let streamUrl = "";
        let subtitles = "";

        // 2. Parse the stream URL from the JSON-LD Schema
        const contentUrlMatch = embedHtml.match(/"contentUrl":\s*"([^"]+)"/);
        if (contentUrlMatch && contentUrlMatch[1]) {
            // Note: playmix.uno sometimes uses .txt instead of .m3u8, AVPlayer handles this fine.
            streamUrl = contentUrlMatch[1].replace(/\\/g, ''); 
        }

        // 3. Parse the Subtitles from the JWPlayer tracks array
        const tracksMatch = embedHtml.match(/tracks:\s*(\[.*?\])/);
        if (tracksMatch && tracksMatch[1]) {
            try {
                // Safely parse the leaked JSON array
                const tracks = JSON.parse(tracksMatch[1]);
                const englishTrack = tracks.find(t => 
                    t.kind === "captions" && t.label.toLowerCase().includes("english")
                );
                
                if (englishTrack && englishTrack.file) {
                    subtitles = englishTrack.file.replace(/\\/g, '');
                }
            } catch(e) {
                console.log("Failed to parse subtitle tracks " + e);
            }
        }

        // 4. Return formatted data. 
        // We attach the closeload origin so the final video CDN allows the connection.
        return JSON.stringify({
            streams: [{
                title: "Auto (HLS)",
                streamUrl: streamUrl,
                headers: {
                    "Referer": "https://closeload.top/",
                    "Origin": "https://closeload.top"
                }
            }],
            subtitles: subtitles
        });

    } catch (error) {
        console.log('Error in extractStreamUrl: ' + error);
        return JSON.stringify({ streams: [], subtitles: "" });
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
