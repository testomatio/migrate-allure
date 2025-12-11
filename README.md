# Migrate Allure TestOps

This script converts Allure TestOps CSV exports to Testomat.io CSV format for seamless test migration.

## Requirements

* NodeJS >= 18 required
* Git

## Installation

Open terminal and run the following commands

```
git clone git@github.com:testomatio/migrate-allure.git
cd migrate-allure
npm install
```

## Usage

Run the script providing path to the Allure TestOps CSV file:

```
node convert.js <path-to-allure-csv>
```

Example:

```
node convert.js allure.csv
```

This script will produce `allure_Testomatio.csv` which can be imported into [Testomat.io](https://app.testomat.io) by setting the import format as Testomat.io.

## Features

The converter automatically processes the following data from Allure TestOps:

* **Test IDs**: Converts Allure IDs to T-prefixed 8-digit format (e.g., `93358` → `T00093358`)
* **Folder Hierarchy**: Maps `Feature/Epic/Story` fields to hierarchical folder structure
* **Test Steps**: Parses and formats test scenarios with proper Markdown structure
* **Preconditions**: Extracts and formats preconditions from the `precondition` field
* **JIRA Integration**: Extracts JIRA issue IDs from `jira-*` columns and URLs
* **Status Mapping**: Converts `automated` field to `Status` column (`true` → `automated`, `false` → `manual`)
* **Metadata Labels**: Automatically extracts remaining fields as key:value labels
* **Character Encoding**: Replaces problematic characters (`<` → `≺`, `>` → `≻`) to prevent HTML entity issues

## Output CSV Structure

The generated CSV includes the following columns:

* **ID** - T-prefixed 8-character test ID
* **Title** - Test case name
* **Folder** - Feature/Epic/Story hierarchy (with `/` replaced by `|` in folder names)
* **Priority** - Mapped priority levels (high/normal/low)
* **Tags** - Extracted from `tag`, `SubStory`, and other metadata fields
* **Owner** - Test owner from `Owner` or `Created By` fields
* **Status** - `automated` or `manual` based on the `automated` field
* **Description** - Markdown-formatted test steps and preconditions
* **Labels** - Key:value pairs from remaining unextracted fields
* **Issues** - Comma-separated JIRA issue IDs

## Customization

This script is provided as is but feel free to update `convert.js` to match your specific needs.

## License

MIT
