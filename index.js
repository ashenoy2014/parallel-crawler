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
    console.error("Usage: index.js [url | number of Alexa Top N sites in input file]");
    process.exit(1);
}

let sites = [];

if (process.argv[2].indexOf("http") === 0) {
    sites = [process.argv[2]];
} else {
    // if given a nuber, load that many sites from the CSV
    const numberOfSites = process.argv[2];

    // load the sites
    sites = fs.readFileSync(sitesFile, "utf-8")
        .split("\n")
        .slice(0, numberOfSites);
}

// call Crawler
var crawler = new Crawler(sites);
crawler.crawl();
