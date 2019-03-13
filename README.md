# parallel-crawler
Crawler to check for presence of open source boomerang snippet. Hostname name to check are provided in a file named "rum_migration_domains.csv".

Usage: node index.js startIndex endIndex  -- start and end point for domains listed in rum_migration_domains.csv file.

Output of the execution currently is written to a file called "output-boomr-version-TIMESTAMP.csv" and has data represented as 
the following tuple: [hostname, boomerang version number seen on page if any, Akamai RUM version number seen on page if any]
