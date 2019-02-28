#!/usr/bin/env node
//
// Imports
//
const Crawler = require("./crawler");
const fs = require("fs");
//const sitesFile = "sites-1000.csv";
//const sitesFile = "avi-sites.csv";
//const sitesFile = "Nic_hostnames.csv";
const sitesFile = "rum_migration_domains.csv";
//const sitesFile = "test1.csv";


// command-line arguments
if (process.argv.length <= 2) {
    console.error("Usage: index.js [url | start end] {(start,end) represent the start and end index from the host input list}");
    process.exit(1);
}

let sites = [];

if (process.argv[2].indexOf("http") === 0) {
    sites = [process.argv[2]];
} else {
    // if given a nuber, load that many sites from the CSV
    const numberOfSites = process.argv[2];
    let upperRangeOfIndex = undefined;
    if (process.argv[3]) {
    	upperRangeOfIndex = process.argv[3];
    }

    console.log("lower index: " + numberOfSites);
    console.log("upperRangeOfIndex: " + upperRangeOfIndex);

    if (!upperRangeOfIndex || (upperRangeOfIndex <= numberOfSites)) {
		// load the sites assuming only upper bound specified on # of sites to process
		console.log("Will process the first " + numberOfSites + " number of sites");
		sites = fs.readFileSync(sitesFile, "utf-8")
			.split("\n")
			.slice(0, numberOfSites);

    } else {
    	// User wants to only checks host between lower and upper bound, with upper bound
    	// not included.
		// load the sites
		console.log("Will process the sites in list starting at " + numberOfSites + " and up to but not including sites at index " + upperRangeOfIndex);
		sites = fs.readFileSync(sitesFile, "utf-8")
			.split("\n")
			.slice(numberOfSites, upperRangeOfIndex);
    }
}

// call Crawler
var crawler = new Crawler(sites);
crawler.crawl();
