"use strict";

//
// Imports
//
const debug = require("debug")("crawler");
const puppeteer = require("puppeteer");
const chalk = require("chalk");
const logUtils = require("log-utils");
const sleep = require("await-sleep");
const { URL } = require("url");
const fs = require("fs");
const { Cluster } = require("puppeteer-cluster");

// create output streams
var outSites = fs.createWriteStream("output-sites.json");
var outUrls = fs.createWriteStream("output-urls.json");
var outBoomrVersion = fs.createWriteStream("output-boomr-version-" + Date.now() + ".csv");

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
		//concurrency: Cluster.CONCURRENCY_BROWSER,
		concurrency: Cluster.CONCURRENCY_CONTEXT,
		maxConcurrency: 30,
		monitor: true,
		/*
		puppeteerOptions: {
			headless: false
		},
		*/
		timeout: 30000
	});
	console.log(logUtils.ok("Cluster initialized"));

	await cluster.task(async ({ page, data: url }) => {
		// debug logging messages from the page
		page.on("console", function(msg) {
			debug(`Frame: ${msg.text()}`);
		});

		page.on("load", async function() {
			console.log(chalk.green("Page load complete for url: " + url));

			let pageData = [];
			pageData.push(url);

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
						pageData.push(boomrVersion);
					} else {
						pageData.push("No Boomerang");
					}
				} else {
					// BOOMR not defined
					console.log("Page does not have Boomerang instrumented");
					pageData.push("No Boomerang");
				}
			} catch (postPLError) {
				console.log("Ran into error while evaluating boomerang for URL: " + url + "; error: " + postPLError);
				pageData.push("Error during BOOMR version analysis");
			}

			let rumJSHandle;
			try {
				rumJSHandle = await page.evaluateHandle(() => {
					return Promise.resolve(window.AKSB ? JSON.stringify(window.AKSB.aksbVersion()) : undefined);
				});

				if (rumJSHandle) {
					let akVersion = await rumJSHandle.jsonValue();
					console.log("AKVersion: " + akVersion);

					if (akVersion) {
						pageData.push(akVersion);
					} else {
						pageData.push("No Akamai Rum");
					}
				} else {
					pageData.push("No Akamai Rum");
				}

			} catch (akRumCheckError) {
				console.log("Ran into error while evaluating Akamai RUM for URL: " + url + "; error: " + akRumCheckError);
				pageData.push("Error during AKVersion version analysis");
			}

			outBoomrVersion.write(pageData.join() + "\n");
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

	try {
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

        urlToCheck = urlToCheck + "/?akamai-rum=on";

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
	} catch(traversalError) {
		console.log("Error while traversing host list: " + traversalError);
		console.log(traversalError);
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

		try {

			dns.lookup(domainToCheck, function(err, family, result) {
				if (!err) {
					resolve(family);
				} else {
					reject(err);
				}
			});
		} catch (dnsError) {
			reject(dnsError);
		}

	});
}

//
// Exports
//
module.exports = Crawler;