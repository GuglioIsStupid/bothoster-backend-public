// import tracery
import tracery from 'tracery-grammar';
import { AbortController } from 'abort-controller';
import fetch from 'node-fetch';
import { fileTypeFromBuffer } from 'file-type';

import { TwitterApi, EApiV1ErrorCode, ApiResponseError } from 'twitter-api-v2';

async function fetchImage(url, T, bot) {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
        controller.abort();
    }, 5 * 1000);

    try {
        let response = await fetch(url, {
            signal: controller.signal
        });

        if (!response.ok) {
            throw new Error(`unexpected response ${response.statusText}`);
        }

        let buffer = await response.buffer();
        let mediaID = await uploadMedia(buffer, T);
        return mediaID;
    } catch (error) {
        console.log("Error fetching image: ", error);
    } finally {
        clearTimeout(timeout);
    }
}

async function uploadMedia(buffer, T) {
    let filetype = null;

    try {
        filetype = await fileTypeFromBuffer(buffer);
    } catch (error) {
        console.log("Error getting file type: ", error);
        return null;
    }

    try {
        const mediaID = await T.v1.uploadMedia(buffer, {
            mimeType: filetype.mime,
        });
        return mediaID;
    } catch (error) {
        console.log("Error uploading media: ", error);
        return null;
    }
}

function matchBracket(text) {
    function reverseString(s) {
        return s.split("").reverse().join("");
    }

    var bracketsRe = /(\}(?!\\)(.+?)\{(?!\\))/g;

    text = reverseString(text);
    var matches = text.match(bracketsRe);
    if (matches)
        matches = matches.map(reverseString);
    else 
        return [];

    return matches;
}

function removeBrackets(text) {
    function reverseString(s) {
        return s.split("").reverse().join("");
    }

    var bracketsRe = /(\}(?!\\)(.+?)\{(?!\\))/g;

    text = reverseString(text);
    return (reverseString(text.replace(bracketsRe, "")));
}

function renderMediaTag(match, T) {
    var unescapeOpen = /\\{/g;
    var unescapeClose = /\\}/g;
    match = match.replace(unescapeOpen, "{");
    match = match.replace(unescapeClose, "}");

    // remove start {
    match = match.substr(1, match.length - 2);
    // remove end }
    match = match.substr(0, match.length);

    match = match.trim()

    if (match.startsWith("img") || match.startsWith("vid")) {
        return fetchImage(match.substr(4), T);
    }

    return null;
}

let mediaList = [];
let mediaIDs = [];

function resetLists() {
    mediaList = [];
    mediaIDs = [];
}

async function doTweet(T, source) {
    resetLists();
    // get origin from source w/ tracery
    let grammar = tracery.createGrammar(source);
    grammar.addModifiers(tracery.baseEngModifiers);

    let origin = grammar.flatten("#origin#");

    let matches = matchBracket(origin);
    for (let match of matches) {
        let media = await renderMediaTag(match, T);
        if (media) {
            mediaList.push(media);
        }
    }

    // flip mediaList
    mediaList = mediaList.reverse();

    origin = removeBrackets(origin);
    origin = origin.replace(/\\{/g, "{");
    origin = origin.replace(/\\}/g, "}");

    // max of 4 media per tweet
    while (mediaList.length > 4) {
        let media = mediaList.pop();
        mediaIDs.push(media);
    }

    try {
        var response = null;
        if (mediaList.length > 0) {
            try {
                response = await T.v2.tweet(origin, {
                    media: {
                        media_ids: mediaList
                    }
                });
            } catch (error) {
                console.log("Error tweeting with media: ", error);
                return error;
            }
        } else {
            response = await T.v2.tweet(origin);
        }
        return response;
    } catch (error) {
        console.log("Error tweeting: ", error);
        return error;
    }

    return true;
}

export {
    doTweet
}