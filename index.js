import { initializeApp } from "firebase/app";
import {
    getFirestore,
    query,
    collection,
    getDocs,
    addDoc,
    where,
    updateDoc,
} from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { doc } from "firebase/firestore";

// twitter api libs
import { TwitterApi, ApiRequestError, EApiV1ErrorCode } from 'twitter-api-v2';

import { doTweet } from './handle-tweet.js';

const pause = (ms) => new Promise(resolve => setTimeout(resolve, ms));
// dotenv
import dotenv from 'dotenv';
dotenv.config();
const firebaseConfig = {
    apiKey: process.env.API_KEY,
    authDomain: process.env.AUTH_DOMAIN,
    projectId: process.env.PROJECT_ID,
    storageBucket: process.env.STORAGE_BUCKET,
    messagingSenderId: process.env.MESSAGING_SENDER_ID,
    appId: process.env.APP_ID,
    measurementId: process.env.MEASUREMENT_ID
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const checkAllBots = async () => {
    console.log("Checking all bots");
    try {
        // get all users
        const users = await getDocs(collection(db, "users"));
        users.forEach(async (user) => {
            // get all bots for user
            const bots = user.data().bots;
            bots.forEach(async (bot) => {
                // check if bot needs to run, if bot has "disabled" flag, don't run it
                // if bot needs to run, run it
                //console.log(bot.disabled, bot.nextRun, new Date().getTime());
                if (bot.disabled) return;
                const currentTime = new Date();
                //console.log("This bot runs in: ", (bot.nextRun - currentTime.getTime()) / 1000 / 60, " minutes");
                if (bot.nextRun > currentTime.getTime()) return;
                if (bot.lastError) bot.lastError = null;
                
                // update last run time
                bot.lastRun = new Date();

                // log into twitter
                // bot.twitterApiKey, bot.twitterApiSecret ( or bot.twitterApiSecretKey), bot.twitterAccessToken, bot.twitterAccessTokenSecret, bot.twitterBearerToken
                /* console.log(
                    `Logging into Twitter with: ${bot.twitterApiKey}, ${bot.twitterApiSecret || bot.twitterApiSecretKey}, ${bot.twitterAccessToken}, ${bot.twitterAccessTokenSecret}, ${bot.twitterBearerToken}`
                ) */
                
                const T = new TwitterApi({
                    appKey: bot.twitterApiKey.trim(),
                    appSecret: (bot.twitterApiSecret || bot.twitterApiSecretKey).trim(),
                    accessToken: bot.twitterAccessToken.trim(),
                    accessSecret: bot.twitterAccessTokenSecret.trim()
                });

                // run bot
                // parse bot.script (json)
                
                let script = null;
		        try {
                    script = JSON.parse(bot.script);
                } catch (error) {
                    bot.lastError = "Error parsing script. Please check the JSON source at https://jsonlint.com/";
                    return;
                }

                let tweet = script.origin[0];

                console.log(`Logged into BOT ID ${bot.id} | BOT NAME ${bot.name}`)

                try {
                    /* T.v2.tweet(tweet).then((response) => {
                        console.log("Tweeted: ", response);
                    }).catch((error) => {
                        console.error("Error tweeting: ", error);
                    }); */
                    var ok = doTweet(T, script, bot).then((response) => {
                        console.log("Tweeted: ", response);
                    }).catch((error) => {
                        //console.error("Error tweeting: ", error);
                        //bot.lastError = error;
                        // make lastError a string
                        /* bot.lastError = JSON.stringify(error); */
                        bot.lastError = "Error tweeting with error code: " + error.code + " | Error message: " + error.message;
                    });

                    if (ok != true) {
                        //console.log("Error tweeting: ", ok);
                        bot.lastError = "Error tweeting with error code: " + ok.code + " | Error message: " + ok.message;
                    }
                    
                } catch (error) {
                    //console.error("Error tweeting: ", error);
                    //bot.lastError = error;
                    // make lastError a string
                    /* bot.lastError = JSON.stringify(error); */
                    bot.lastError = "Error tweeting with error code: " + error.code + " | Error message: " + error.message;
                }

                // update next run time
                bot.nextRun = new Date(currentTime.getTime() + bot.schedule * 1000).getTime();
                //console.log("Next run: ", bot.nextRun, " current time: ", currentTime.getTime());

                // run bot
                // if bot fails, update bot status
                // if bot succeeds, update bot status
                //console.log("Bot run complete");
            });

            // update user's bots
            await updateDoc(doc(db, "users", user.id), {
                bots: bots
            });
        });
    } catch (error) {
        return error;
    }
}

const update = async () => {
    try {
        // check all bots
        await checkAllBots();
    } catch (error) {
        return error;
    }
}

const main = async () => {
    while (true) { // 15 minutes
        await update();
        await pause(60 * 1000 * 15);
    }
    //await update();
}

// Start the main loop
main();