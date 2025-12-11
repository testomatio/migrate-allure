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
        skip_empty_lines: true,
        delimiter: ';',
        quote: '"',
        escape: '"',
        relax_column_count: true,
        relax_quotes: true
    });

    // Define required columns for Allure TestOps
    const requiredColumns = [
        'allure_id', 'name', 'scenario',
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
        // Process each record as a test case
        console.log('✅', record['name']);

        // Format Allure ID with T prefix and 8 digits
        const allureId = record['allure_id'] ? formatAllureId(record['allure_id']) : '';

        // Build description with preconditions and steps
        let descriptionParts = [];

        // Add preconditions if they exist
        if (record['precondition'] && record['precondition'].trim()) {
            descriptionParts.push('### Preconditions\n\n' + cleanHtml(record['precondition'].trim()));
        }

        // Parse and format steps from scenario
        if (record['scenario'] && record['scenario'].trim()) {
            const steps = parseScenario(record['scenario']);
            if (steps.length > 0) {
                descriptionParts.push('### Steps\n\n' + steps.join('\n'));
            }
        }

        // Add expected result if it exists
        if (record['expected_result'] && record['expected_result'].trim()) {
            descriptionParts.push('### Expected Result\n\n' + cleanHtml(record['expected_result'].trim()));
        }

        // Extract tags, links, and other metadata
        const tags = extractTags(record);
        const owner = record['Owner'] || record['Created By'] || '';
        const priority = mapPriority(record['Priority'] || record['Priority']);
        const url = extractLinks(record);
        const folder = buildFolderHierarchy(record);
        const issues = extractJiraIssues(record);
        const labels = extractLabels(record);
        const status = mapStatus(record['automated']);

        // Create test case
        const testCase = {
            'ID': allureId,
            'Title': record['name'] || '',
            'Folder': folder,
            'Emoji': '',
            'Priority': priority,
            'Tags': tags,
            'Owner': owner,
            'Status': status,
            'Description': descriptionParts.join('\n\n'),
            'Examples': '',
            'Labels': labels,
            'Issues': issues
        };

        transformedData.push(testCase);
    });

    // Transform the data to the target format (already done above)
    const finalData = transformedData;

    // Write to output CSV
    const output = stringify(finalData, {
        header: true,
        columns: [
            'ID', 'Title', 'Folder', 'Emoji', 'Priority',
            'Tags', 'Owner', 'Status', 'Description', 'Examples', 'Labels', 'Issues'
        ]
    });

    fs.writeFileSync(outputFile, output);
    console.log(`Conversion complete. Output written to ${outputFile}`);
}

function formatAllureId(allureId) {
    // Convert to string, pad with zeros to 8 digits, and add T prefix
    const idStr = allureId.toString();
    const paddedId = idStr.padStart(8, '0');
    return `T${paddedId}`;
}

function mapStatus(automated) {
    if (automated === 'true' || automated === true) {
        return 'automated';
    } else {
        return 'manual';
    }
}

function mapPriority(priority) {
    const priorityMap = {
        'Blocker': 'high',
        'Critical': 'high',
        'Major': 'normal',
        'Minor': 'normal',
        'Trivial': 'low',
        '🔴 High': 'high',
        '🟡 Medium': 'normal',
        '🟢 Low': 'low'
    };
    return priorityMap[priority] || 'normal';
}

function parseScenario(scenario) {
    const steps = [];
    const lines = scenario.split('\n');
    let currentStep = null;

    for (const line of lines) {
        const trimmedLine = line.trim();

        // Check if it's a step (starts with [step N])
        if (trimmedLine.match(/^\[step \d+\]/)) {
            // Add previous step if it exists
            if (currentStep) {
                steps.push(currentStep);
            }

            // Start new step
            const stepText = trimmedLine.replace(/^\[step \d+\]\s*/, '');
            currentStep = `* ${cleanHtml(stepText)}`;
        }
        // Check if it's an expected result (starts with \t[step N.M])
        else if (trimmedLine.match(/^\[step \d+\.\d+\]/)) {
            const expectedText = trimmedLine.replace(/^\[step \d+\.\d+\]\s*/, '');
            if (currentStep) {
                currentStep += `\n  *Expected:* ${cleanHtml(expectedText)}`;
            }
        }
        // Handle non-empty lines that don't have step prefixes but are part of current step
        else if (trimmedLine && !trimmedLine.startsWith('[') && currentStep) {
            // This is a continuation of the current step (like "Fail request:" and its details)
            currentStep += `\n    ${cleanHtml(trimmedLine)}`;
        }
        // Handle sub-items (indented lines starting with -)
        else if (trimmedLine.startsWith('-') && currentStep) {
            // This is part of expected results or sub-items
            const subItem = trimmedLine.replace(/^\-\s*/, '');
            if (subItem) {
                currentStep += `\n    ${cleanHtml(subItem)}`;
            }
        }
        // Handle standalone non-step lines only if they come before any step
        else if (trimmedLine && !trimmedLine.startsWith('[') && !trimmedLine.startsWith('-') && !currentStep) {
            // This is a standalone line before any steps - create it as a step
            currentStep = `* ${cleanHtml(trimmedLine)}`;
        }
    }

    // Add the last step
    if (currentStep) {
        steps.push(currentStep);
    }

    return steps;
}

function buildFolderHierarchy(record) {
    const folderParts = [];
    const pathOrder = ['Epic', 'Feature', 'Story', 'SubStory'];

    // Map path order to folder number
    const folderMapping = {
        'Epic': 'Folder1',
        'Feature': 'Folder2',
        'Story': 'Folder3',
        'SubStory': 'Folder4'
    };

    // Build path by preferring Folder* values over Epic/Feature/Story at corresponding levels
    pathOrder.forEach((field, index) => {
        const folderField = folderMapping[field];

        // Check if corresponding Folder* exists
        if (record[folderField] && record[folderField].trim()) {
            // Use Folder* value
            folderParts.push(record[folderField].trim());
        } else if (record[field] && record[field].trim()) {
            // Use Epic/Feature/Story value (first one only)
            const firstValue = record[field].split(',')[0].trim();
            if (firstValue) {
                folderParts.push(firstValue);
            }
        }
    });

    // Add additional Folder* values beyond Folder4
    for (let i = 5; i <= 8; i++) {
        const folderField = `Folder${i}`;
        if (record[folderField] && record[folderField].trim()) {
            folderParts.push(record[folderField].trim());
        }
    }

    // If no path built yet, try other folder fields
    if (folderParts.length === 0) {
        ['Suite', 'Folder', 'Test Suite', 'Test Suite Path'].forEach(field => {
            if (record[field] && record[field].trim()) {
                folderParts.push(record[field].trim());
            }
        });
    }

    // Replace / with | in each folder part to avoid conflicts with Testomat separator
    return folderParts.map(part => part.replace(/\//g, '|')).join('/');
}

function extractLabels(record) {
    const labels = [];

    // Define columns that are already extracted
    const extractedColumns = [
        'allure_id', 'name', 'scenario', 'precondition', 'tag', 'Owner', 'Priority', 'link', 'Suite', 'automated',
        'Epic', 'Feature', 'Story', 'SubStory'
    ];

    for (const [key, value] of Object.entries(record)) {
        // Skip if value is empty or null
        if (!value || !value.trim()) {
            continue;
        }

        // Skip if already extracted
        if (extractedColumns.includes(key)) {
            continue;
        }

        // Skip jira-* columns (handled separately)
        if (key.toLowerCase().startsWith('jira-')) {
            continue;
        }

        // Skip Folder* columns
        if (key.toLowerCase().startsWith('folder')) {
            continue;
        }

        // Skip multi-word/multi-line values (contains newlines, quotes, or long text)
        const cleanValue = value.trim();
        if (cleanValue.includes('\n') || cleanValue.includes('"') || cleanValue.length > 100) {
            continue;
        }

        // Add as key:value label
        labels.push(`${key}:${cleanValue}`);
    }

    // Add Epic/Feature/Story/SubStory as labels with ALL values (including first ones used in path)
    ['Epic', 'Feature', 'Story', 'SubStory'].forEach(field => {
        if (record[field] && record[field].trim()) {
            const values = record[field].split(',').map(v => v.trim()).filter(v => v);
            // Add all values as labels
            values.forEach(value => {
                labels.push(`${field}:${value}`);
            });
        }
    });

    // Add important fields that should always be included as labels (skip if already added)
    const importantFields = ['status'];
    for (const field of importantFields) {
        if (record[field] && record[field].trim()) {
            const labelValue = `${field}:${record[field].trim()}`;
            // Check if this label already exists to avoid duplicates
            if (!labels.some(label => label.startsWith(`${field}:`))) {
                labels.push(labelValue);
            }
        }
    }

    return labels.join(', ');
}

function extractTags(record) {
    const tags = [];

    // Process tag field - split by comma and replace spaces with underscores
    if (record['tag'] && record['tag'].trim()) {
        const tagField = record['tag'].trim();
        // Split by comma and clean each tag
        const splitTags = tagField.split(',').map(tag =>
            tag.trim().replace(/\s+/g, '_')
        );
        tags.push(...splitTags);
    }

    // Don't add Feature/Epic/Story to tags since they're now used for folders
    // But we can still add other metadata as tags (also replace spaces with underscores)
    if (record['SubStory']) tags.push(record['SubStory'].trim().replace(/\s+/g, '_'));
    if (record['Test Type']) tags.push(record['Test Type'].trim().replace(/\s+/g, '_'));
    if (record['Automation Type']) tags.push(record['Automation Type'].trim().replace(/\s+/g, '_'));

    return tags.join(',');
}

function extractJiraIssues(record) {
    const jiraIssues = [];
    const jiraPattern = /([A-Z]+-\d+)/g;

    // Check all columns for jira-* columns
    for (const [key, value] of Object.entries(record)) {
        if (key.toLowerCase().startsWith('jira-') && value && value.trim()) {
            // Extract JIRA IDs from URLs or plain text
            const matches = value.match(jiraPattern);
            if (matches) {
                jiraIssues.push(...matches);
            }
        }
    }

    // Also check common fields that might contain JIRA issues
    const commonFields = ['link', 'References', 'description', 'expected_result'];
    for (const field of commonFields) {
        if (record[field] && record[field].trim()) {
            const matches = record[field].match(jiraPattern);
            if (matches) {
                jiraIssues.push(...matches);
            }
        }
    }

    // Remove duplicates and join with comma
    return [...new Set(jiraIssues)].join(', ');
}

function extractLinks(record) {
    const links = [];

    // Extract link from the link field
    if (record['link'] && record['link'].trim()) {
        links.push(record['link'].trim());
    }

    return links.join(', ');
}

function cleanHtml(text) {
    if (!text) return '';
    return text
        .replace(/<br\s*\/?>/gi, '\n')  // Replace <br> with newline
        .replace(/<\/?(p|span|div|ul|li)[^>]*>/gi, '') // Remove p, ul, li tags
        .replace(/</g, '≺')  // Replace < with UTF character
        .replace(/>/g, '≻')  // Replace > with UTF character
        .replace(/\n\s*\n/g, '\n')  // Remove multiple newlines
        .trim();
}

try {
    convertTestCases(inputFile, outputFile);
} catch (error) {
    console.error('Error during conversion:', error.message);
}
