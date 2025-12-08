# Migrate Qmetry

This script converts Qmetry CSV script to Testomat.io CSV format

## Reqiurements

* NodeJS >= 18 required
* Git

## Installation

Open terminal and run the following commands

```
git clone git@github.com:testomatio/migrate-qmetry.git
cd migrate-qmetry
npm install
```

## Usage

Run the script providing path to the Qmetry CSV file

```
node convert.js <path-to-qmetry-csv>
```

Example:

```
node convert.js TestCases.csv
```

This script will produce TestCases_Testomatio.csv

It can be imported into [Testomat.io](https://app.testomat.io) by setting import format as Testomat.io


## Customization

This script is provided as is but feel free to update `convert.js` to match your needs.


## License

MIT
