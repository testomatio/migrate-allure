const fs = require('fs');
const csv = require('csv-parse/sync');
const { stringify } = require('csv-stringify/sync');
const path = require('path');

// Get input file from command line arguments
const inputFile = process.argv[2];

if (!inputFile) {
    console.error('Please provide an input file path as an argument');
    console.error('Usage: node convert.js <input-file.csv>');
    process.exit(1);
}

// Generate output filename by adding _Testomatio before the extension
const parsedPath = path.parse(inputFile);
const outputFile = path.join(
    parsedPath.dir,
    `${parsedPath.name}_Testomatio${parsedPath.ext}`
);

function convertTestCases(inputFile, outputFile) {
    // Read and parse input CSV
    const inputData = fs.readFileSync(inputFile, 'utf-8');
    const records = csv.parse(inputData, {
        columns: true,
        skip_empty_lines: true
    });

    // Define required columns
    const requiredColumns = [
        'Entity Key', 'Test Case Summary', 'Test Case Folder Path',
    ];

    // Validate columns
    const inputColumns = Object.keys(records[0]);
    const missingColumns = requiredColumns.filter(col => !inputColumns.includes(col));

    if (missingColumns.length > 0) {
        console.error('The following required columns are missing from the input file:', missingColumns.join(', '));
        process.exit(1);
    }

    let currentTestCase = null;
    const transformedData = [];

    records.forEach(record => {
        if (record['Test Case Summary']) {
            // If we encounter a new test case summary, push the previous one to the transformed data
            if (currentTestCase) {
                transformedData.push(currentTestCase);
            }

            console.log('✅', record['Test Case Summary'])

            // Start a new test case
            currentTestCase = {
                'ID': `TS${record['Entity Key']}`,
                'Title': record['Test Case Summary'],
                'Folder': record['Test Case Folder Path'],
                'Emoji': '',
                'Priority': mapPriority(record['Test Case Priority']),
                'Tags': record['Label(s)']?.split(',')?.map(tag => tag.trim())?.join(','),
                'Owner': record['Created By']?.split('[')[0],
                'Description': '',
                'Examples': '',
                'Labels': '',
                'Url': '',
                'Matched': '',
                'Steps': []
            };
        }

        // Add steps to the current test case
        const stepDescription = record['Step Description'] || '';
        const stepExpectedOutcome = record['Step Expected Outcome(Plain Text)'] || '';

        if (stepDescription && !stepDescription.includes('Preconditions:')) {
          if (!currentTestCase.Steps.join(' ').includes('## Steps')) {
            currentTestCase.Steps.push('\n\n## Steps\n');
          }
          currentTestCase.Steps.push(`* ${cleanHtml(stepDescription.trim())}`);
          if (stepExpectedOutcome) {
              currentTestCase.Steps.push(`  *Expected:* ${cleanHtml(stepExpectedOutcome.trim())}`);
          }
        }

        // Add preconditions if they exist
        if (stepDescription.includes('Preconditions:')) {
            currentTestCase.Steps.push('\n## Precondition\n\n' + cleanHtml(stepDescription)
                .split('Preconditions:')[1]
                .trim());
        }
    });

    // Push the last test case to the transformed data
    if (currentTestCase) {
        transformedData.push(currentTestCase);
    }

    // Transform the data to the target format
    const finalData = transformedData.map(testCase => {
        return {
            'ID': testCase.ID,
            'Title': testCase.Title,
            'Folder': testCase.Folder,
            'Emoji': '',
            'Priority': testCase.Priority,
            'Tags': testCase.Tags,
            'Owner': testCase.Owner,
            'Description': testCase.Steps.join('\n'),
            'Examples': '',
            'Labels': '',
            'Url': '',
            'Matched': ''
        };
    });

    // Write to output CSV
    const output = stringify(finalData, {
        header: true,
        columns: [
            'ID', 'Title', 'Folder', 'Emoji', 'Priority',
            'Tags', 'Owner', 'Description', 'Examples', 'Labels', 'Url', 'Matched'
        ]
    });

    fs.writeFileSync(outputFile, output);
    console.log(`Conversion complete. Output written to ${outputFile}`);
}

function mapPriority(priority) {
    const priorityMap = {
        'Blocker': 'high',
        'Critical': 'high',
        'Major': 'normal',
        'Minor': 'normal',
        'Trivial': 'low'
    };
    return priorityMap[priority] || 'normal';
}

function cleanHtml(text) {
    if (!text) return '';
    return text
        .replace(/<br\s*\/?>/gi, '\n')  // Replace <br> with newline
        .replace(/<\/?(p|span|div|ul|li)[^>]*>/gi, '') // Remove p, ul, li tags
        .replace(/\n\s*\n/g, '\n')  // Remove multiple newlines
        .trim();
}

try {
    convertTestCases(inputFile, outputFile);
} catch (error) {
    console.error('Error during conversion:', error.message);
}
