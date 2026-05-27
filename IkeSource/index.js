/** searchResults
 * Searches for anime/shows/movies based on a keyword.
 * @param {string} keyword - The search keyword.
 * @returns {Promise<string>} - A JSON string of search results.
 */
async function searchResults(keyword) {
    try {
        const search_base = 'https://www.levidia.ch/search.php?q='
        const encodedKeyword = encodeURIComponent(keyword);
        const responseText = await soraFetch(`${search_base}${encodedKeyword}`);
        const html = await responseText.text();

        const showRegex = /<li class="mlist"[\s\S]+?href="([\s\S]+?)"[\s\S]+?src="([\s\S]+?)"[\s\S]+?<strong>([\s\S]+?)</gi
        const showMatch = html.matchAll(showRegex);
        const transformedResults = Array.from(html.matchAll(showRegex)).map(x => ({
            title: x[3],
            image: x[2],
            href:  x[1]
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
        
        const descriptionRegex = /<div class="plot" [^>]+>([^<]+)</i;
        const durationRegex = /Runtime: ([^<]+)</i;
        const releaseRegex = /Release: [^>]+>([^<]+)</i;

        const descriptionMatch = html.match(descriptionRegex);
        const durationMatch = html.match(durationRegex);
        const releaseMatch = html.match(releaseRegex);

        const transformedResults = [{
            description: descriptionMatch[1],
            aliases: durationMatch[1],
            airdate: releaseMatch[1]
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
        const responseText = await soraFetch(url);
        const html = await responseText.text();

        const seasonRegex = /<li class="pageheader mals">[\s\S]*?>Season \d+<[\s\S]*?<\/li>([\s\S]+?)(?=<li class="pageheader mals">|<\/ul>)/gi;
        const episodeRegex = /(tv-episode\.php\?[^"]+)/gi;
        
        const seasonMatch = Array.from(html.matchAll(seasonRegex));
        const episodesList = [];

        for (let index = seasonMatch.length - 1; index >= 0; index--) {
            const seasonHTML = seasonMatch[index];
            const episodeMatch = seasonHTML[1].matchAll(episodeRegex);
            episodeMatch.forEach((ep, i) => {
                const num = i + 1;
                const destinationLink = 'https://www.levidia.ch/' + ep[1];
                episodesList.push({
                    href: destinationLink,
                    number: num
                })
            })
        }

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
    const responseText = await soraFetch(url);
    const html = await responseText.text();
    
    const sourceRegex = /<span[\s\S]+?><b>([\s\S]+?)<\/b>[\s\S]+? class="mainlink kanan"><a href="([^"]+)/gi;
    const sourceMatch = Array.from(html.matchAll(sourceRegex));
    let providers = {};

    sourceMatch.forEach(source => {
        const rawName = source[1].trim().toLowerCase(); 
        const rawUrl = source[2];
        
        const fullUrl = rawUrl.startsWith('http') ? rawUrl : 'https://www.levidia.ch/' + rawUrl;

        providers[fullUrl] = rawName;
    });

    // Multiple extractor (recommended)
    let streams = [];
    try {
      streams = await multiExtractor(providers);
      let returnedStreams = {
        streams: streams,
      };

      console.log(
        "Multi extractor streams: " + JSON.stringify(returnedStreams)
      );
      return JSON.stringify(returnedStreams);
    } catch (error) {
      console.log("Multi extractor error:" + error);
      return JSON.stringify([{ provider: "Error2", link: "" }]);
    }
  } catch (error) {
    console.log("Fetch error:" + error);
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