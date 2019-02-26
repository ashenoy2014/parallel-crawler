"use strict";

//
// Imports
//
const debug = require("debug")("crawler");
const puppeteer = require("puppeteer");
const chalk = require("chalk");
const sleep = require("await-sleep");
//const limit = require("limit-string-length");
const { URL } = require("url");
const fs = require("fs");
const { Cluster } = require("puppeteer-cluster");

// create output streams
var outSites = fs.createWriteStream("output-sites.json");
var outUrls = fs.createWriteStream("output-urls.json");
var outBoomrVersion = fs.createWriteStream("output-boomr-version.csv");

//
// Functions
//
/**
 * Creates a new Crawler
 *
 * @param {string[]} sites Sites
 */
function Crawler(sites) {
    this.sites = sites;
}

/**
 * Starts the Crawler run
 */
Crawler.prototype.crawl = async function() {
	console.log("Will initialize Cluster");
	let url = undefined;

	const cluster = await Cluster.launch({
		concurrency: Cluster.CONCURRENCY_CONTEXT,
		maxConcurrency: 4,
		monitor: true,
		/*
		puppeteerOptions: {
			headless: false
		},
		*/
		timeout: 60000
	});

	console.log("Will put task definition");
	await cluster.task(async ({ page, data: url }) => {
		page.on("load", async function() {
			console.log(chalk.green("Page load complete for url: " + url));
			// Evaluate for BOOMR
			let boomrJSHandle;
			boomrJSHandle = await page.evaluateHandle(() => {
				return Promise.resolve(window.BOOMR ? JSON.stringify(window.BOOMR.version) : undefined);
			});

			// debug logging messages from the page
			page.on("console", function(msg) {
				debug(`Frame: ${msg.text()}`);
			});

			if (boomrJSHandle) {
				let boomrVersion = await boomrJSHandle.jsonValue();
				console.log("BOOMR: " + boomrVersion);

				if (boomrVersion) {
					outBoomrVersion.write(url + ", " + boomrVersion);
				} else {
					outBoomrVersion.write(url + ", No Boomerang");
				}
				outBoomrVersion.write("\n");
			} else {
				// BOOMR not defined
				console.log("Page does not have Boomerang instrumented");
				outBoomrVersion.write(url + ",NoBoomR");
			}
		}.bind(this));


		try {
			await page.goto(url, {
			                waitUntil: ["networkidle2", "load"],
			                timeout: 60000
			            });
		} catch (e) {
            console.log("Crawl timeout");
            //outBoomrVersion.write(url + ", Page load timed out\n");
        }
        console.log("Done loading site: sleep for 2 seconds");
        await sleep(1000);
	});

	cluster.on('taskerror', (err, data) => {
		console.log(`Error crawling ${data}: ${err.message}`);
	});

	// run through each page
    for (url of this.sites) {
        console.log("From file, Got URL: " + url);

        if (url.indexOf("http://") !== 0 &&
            url.indexOf("https://") !== 0) {
            // start with the HTTP site
            url = "http://" + url + "/";
        }

        console.log(chalk.underline(url));

        //
        // Add the specified URL to the cluster task pool
        //
        await cluster.queue(url);
    }

	await cluster.idle();
	console.log("Closing cluster");
	await cluster.close();
};

//
// Exports
//
module.exports = Crawler;