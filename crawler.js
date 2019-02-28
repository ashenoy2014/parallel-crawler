"use strict";

//
// Imports
//
const debug = require("debug")("crawler");
const puppeteer = require("puppeteer");
const chalk = require("chalk");
const logUtils = require("log-utils");
const sleep = require("await-sleep");
//const limit = require("limit-string-length");
const { URL } = require("url");
const fs = require("fs");
const { Cluster } = require("puppeteer-cluster");

// create output streams
var outSites = fs.createWriteStream("output-sites.json");
var outUrls = fs.createWriteStream("output-urls.json");
var outBoomrVersion = fs.createWriteStream("output-boomr-version.csv");

// DNS
//var dns = require('native-dns');
//var util = require('util');

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
	let urlToCheck = undefined;

	const cluster = await Cluster.launch({
		concurrency: Cluster.CONCURRENCY_BROWSER,
		maxConcurrency: 5,
		monitor: true,
		/*
		puppeteerOptions: {
			headless: false
		},
		*/
		timeout: 60000
	});
	console.log(logUtils.ok("Cluster initialized"));

	await cluster.task(async ({ page, data: url }) => {
		// debug logging messages from the page
		page.on("console", function(msg) {
			debug(`Frame: ${msg.text()}`);
		});

		page.on("load", async function() {
			console.log(chalk.green("Page load complete for url: " + url));
			// Evaluate for BOOMR
			let boomrJSHandle;
			try {
			boomrJSHandle = await page.evaluateHandle(() => {
				return Promise.resolve(window.BOOMR ? JSON.stringify(window.BOOMR.version) : undefined);
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
				outBoomrVersion.write(url + ",NoBoomR\n");
			}
			} catch (postPLError) {
				console.log("Ran into error inside page load for URL: " + url + "; error: " + postPLError);
				outBoomrVersion.write(url + ", Error during page load handling\n");
			}
		}.bind(this));

		try {
			await page.goto(url, {
			                waitUntil: ["networkidle2", "load"],
			                timeout: 60000
			            });
		} catch (e) {
            console.log("Crawl timeout: " + url);
            outBoomrVersion.write(url + ", Page load timed out\n");
        }
	});

	cluster.on('taskerror', (err, data) => {
		console.log(`Error crawling ${data}: ${err.message}`);
	});	

	// run through each page
    for (var inputUrl of this.sites) {
        // There is some random crap at the end of the URL string that we 
        // get from ROSE tool, take it out.
        inputUrl = inputUrl.substring(0, inputUrl.length-1);

        if (inputUrl.indexOf("http://") !== 0 &&
            inputUrl.indexOf("https://") !== 0) {
            // start with the HTTP site
            urlToCheck = "http://" + inputUrl;
        }
        else {
        	urlToCheck = inputUrl;
        }

        try {
        	var resolvedDomain = undefined;
        	if (inputUrl.indexOf("www.") === 0) {
        		resolvedDomain = await doesDomainNameResolve(inputUrl.substring(4, inputUrl.length));
        	} else {
        		resolvedDomain = await doesDomainNameResolve(inputUrl);
        	}
			console.log("promise result: " + resolvedDomain);
			if (resolvedDomain) {
				// Domain resolved; queue it in task pool
				// Add the specified URL to the cluster task pool
				//
				await cluster.queue(urlToCheck);
			}
			else {
				outBoomrVersion.write(inputUrl + ", Domain name unresolved\n");
			}
		} catch (error) {
			console.log("Caught promise reject error for url: " + inputUrl + "; error: "+ error);
			outBoomrVersion.write(inputUrl + ", Domain name unresolved\n");
		}
    }

	await cluster.idle();
	console.log("Closing cluster");
	await cluster.close();
};

async function doesDomainNameResolve(domainToCheck) {
	return new Promise((resolve, reject) => {
		console.log("Starting promise work on : " + domainToCheck);
		var dns = require('native-dns');
		var ip = undefined;

		dns.lookup(domainToCheck, function(err, family, result) {
			if (!err) {
				resolve(family);
			} else {
				reject(err);
			}
		});

	});
}

//
// Exports
//
module.exports = Crawler;