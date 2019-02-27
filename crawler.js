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
		maxConcurrency: 1,
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
            console.log("Crawl timeout: " + url);
            outBoomrVersion.write(url + ", Page load timed out\n");
        }
        //console.log("Done loading site: sleep for 2 seconds");
        await sleep(1000);
	});

	cluster.on('taskerror', (err, data) => {
		console.log(`Error crawling ${data}: ${err.message}`);
	});

	
	try {
		var domain = "walmart.com";

		var resolvedDomain = await doesDomainNameResolve(domain);
		console.log("promise result: " + resolvedDomain);
	}
	catch (error){
		console.log("Caught promise reject error: " + error);
	}
	

	// run through each page
    for (var inputUrl of this.sites) {
        //console.log("From file, Got URL: " + url);

        if (inputUrl.indexOf("http://") !== 0 &&
            inputUrl.indexOf("https://") !== 0) {
            // start with the HTTP site
            //url = "http://" + url + "/";
            urlToCheck = "http://" + inputUrl;
        }

        //console.log("Resolving domain: " + chalk.underline(url));
        try {
        	var resolvedDomain = undefined;
        	if (inputUrl.indexOf("www.") === 0) {
        		resolvedDomain = await doesDomainNameResolve(inputUrl.substring(4));
        	} else {
        		resolvedDomain = await doesDomainNameResolve(inputUrl);
        	}
			console.log("promise result: " + resolvedDomain);
		} catch (error) {
			console.log("Caught promise reject error: " + error);
		}

        /*
        try {
	        var domainResolved = await doesDomainNameResolve(url);
	        if (domainResolved && domainResolved === true) {
	        	console.log(logUtils.ok(url));
				//
				// Add the specified URL to the cluster task pool
				//
				await cluster.queue(url);
	        }
	        else {
	        	console.log("Didnt resolve successfully: " + url);
	        	console.log(logUtils.error);
	        	outBoomrVersion.write(url + ", Domain name unresolved\n");
	        }
	    }
	    catch(err) {
	    	console.log("Didnt resolve successfully: " + url + "; Marking and Skipping");
	    	outBoomrVersion.write(url + ", Domain name unresolved\n");
	    }
	    */
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

		/*
		dns.resolve(domainToCheck, function(error, results) {
			var i;
			if (!error) {
				if (results) {
					for (i = 0; i < results.length; i++) {
						console.log(domainToCheck, results[i]);
						resolve(true);
					}
				} else {
					console.log("resolved but empty result: " + results);
					resolve(false);
				}
			} else {
				console.log("Rejecting promise. Hit Error: " + error);
				reject(error);
			}
		});
		*/
		
		var question = dns.Question({
			name: domainToCheck,
			type: 'A',
		});

		var start = Date.now();

		var req = dns.Request({
			question: question,
			server: {
				address: '8.8.8.8',
				port: 53,
				type: 'udp'
			},
			timeout: 2000,
		});

		req.on('timeout', function() {
			console.log('Timeout in making DNS request to: ' + domainToCheck);
			resolve(false);
		});

		req.on('message', function(err, answer) {
			answer.answer.forEach(function(a) {
				console.log('For domain: ' + domainToCheck + ', answer: ' + a.address);
				if (a.address) {
					ip = a.address;
				}
			});
		});

		req.on('end', function() {
			var delta = (Date.now()) - start;
			console.log('For domain: ' + domainToCheck + 'Finished processing request: ' + delta.toString() + 'ms');
			resolve(ip);
		});

		req.send();
		

	});
}

//
// Exports
//
module.exports = Crawler;