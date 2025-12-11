const fs = require('fs');
const csv = require('csv-parse/sync');
const { stringify } = require('csv-stringify/sync');
const path = require('path');

const inputFile = process.argv[2];

if (!inputFile) {
    console.error('Please provide an input file path as an argument');
    console.error('Usage: node convert.js <input-file.csv>');
    process.exit(1);
}

const parsedPath = path.parse(inputFile);
const outputFile = path.join(
    parsedPath.dir,
    `${parsedPath.name}_Testomatio${parsedPath.ext}`
);

function convertTestCases(inputFile, outputFile) {
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

    const requiredColumns = ['allure_id', 'name', 'scenario'];
    const inputColumns = Object.keys(records[0]);
    const missingColumns = requiredColumns.filter(col => !inputColumns.includes(col));

    if (missingColumns.length > 0) {
        console.error('The following required columns are missing from the input file:', missingColumns.join(', '));
        process.exit(1);
    }

    const transformedData = [];

    records.forEach(record => {
        console.log('✅', record['name']);

        const allureId = record['allure_id'] ? formatAllureId(record['allure_id']) : '';
        let descriptionParts = [];

        if (record['precondition'] && record['precondition'].trim()) {
            descriptionParts.push('### Preconditions\n\n' + cleanHtml(record['precondition'].trim()));
        }

        if (record['scenario'] && record['scenario'].trim()) {
            const steps = parseScenario(record['scenario']);
            if (steps.length > 0) {
                descriptionParts.push('### Steps\n\n' + steps.join('\n'));
            }
        }

        if (record['expected_result'] && record['expected_result'].trim()) {
            descriptionParts.push('### Expected Result\n\n' + cleanHtml(record['expected_result'].trim()));
        }

        const tags = extractTags(record);
        const owner = record['Owner'] || record['Created By'] || '';
        const priority = mapPriority(record['Priority'] || record['Priority']);
        const folder = buildFolderHierarchy(record);
        const issues = extractJiraIssues(record);
        const labels = extractLabels(record);
        const status = mapStatus(record['automated']);

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

    const output = stringify(transformedData, {
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

        if (trimmedLine.match(/^\[step \d+\]/)) {
            if (currentStep) {
                steps.push(currentStep);
            }
            const stepText = trimmedLine.replace(/^\[step \d+\]\s*/, '');
            currentStep = `* ${cleanHtml(stepText)}`;
        }
        else if (trimmedLine.match(/^\[step \d+\.\d+\]/)) {
            const expectedText = trimmedLine.replace(/^\[step \d+\.\d+\]\s*/, '');
            if (currentStep) {
                currentStep += `\n  *Expected:* ${cleanHtml(expectedText)}`;
            }
        }
        else if (trimmedLine && !trimmedLine.startsWith('[') && currentStep) {
            currentStep += `\n    ${cleanHtml(trimmedLine)}`;
        }
        else if (trimmedLine.startsWith('-') && currentStep) {
            const subItem = trimmedLine.replace(/^\-\s*/, '');
            if (subItem) {
                currentStep += `\n    ${cleanHtml(subItem)}`;
            }
        }
        else if (trimmedLine && !trimmedLine.startsWith('[') && !trimmedLine.startsWith('-') && !currentStep) {
            currentStep = `* ${cleanHtml(trimmedLine)}`;
        }
    }

    if (currentStep) {
        steps.push(currentStep);
    }

    return steps;
}

function buildFolderHierarchy(record) {
    const folderParts = [];
    const pathOrder = ['Epic', 'Feature', 'Story', 'SubStory'];

    // Map Epic/Feature/Story to Folder1-Folder4
    const folderMapping = {
        'Epic': 'Folder1',
        'Feature': 'Folder2',
        'Story': 'Folder3',
        'SubStory': 'Folder4'
    };

    // Prefer Folder* values over Epic/Feature/Story at corresponding levels
    pathOrder.forEach((field) => {
        const folderField = folderMapping[field];

        if (record[folderField] && record[folderField].trim()) {
            folderParts.push(record[folderField].trim());
        } else if (record[field] && record[field].trim()) {
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

    // Replace / with | to avoid conflicts with Testomat separator
    return folderParts.map(part => part.replace(/\//g, '|')).join('/');
}

function extractLabels(record) {
    const labels = [];

    const extractedColumns = [
        'allure_id', 'name', 'scenario', 'precondition', 'tag', 'Owner', 'Priority', 'link', 'Suite', 'automated',
        'Epic', 'Feature', 'Story', 'SubStory'
    ];

    for (const [key, value] of Object.entries(record)) {
        if (!value || !value.trim()) {
            continue;
        }

        if (extractedColumns.includes(key) || key.toLowerCase().startsWith('jira-') || key.toLowerCase().startsWith('folder')) {
            continue;
        }

        const cleanValue = value.trim();
        if (cleanValue.includes('\n') || cleanValue.includes('"') || cleanValue.length > 100) {
            continue;
        }

        labels.push(`${key}:${cleanValue}`);
    }

    // Add all Epic/Feature/Story/SubStory values as labels (including first ones used in path)
    ['Epic', 'Feature', 'Story', 'SubStory'].forEach(field => {
        if (record[field] && record[field].trim()) {
            const values = record[field].split(',').map(v => v.trim()).filter(v => v);
            values.forEach(value => {
                labels.push(`${field}:${value}`);
            });
        }
    });

    // Add important fields, avoiding duplicates
    ['status'].forEach(field => {
        if (record[field] && record[field].trim()) {
            const labelValue = `${field}:${record[field].trim()}`;
            if (!labels.some(label => label.startsWith(`${field}:`))) {
                labels.push(labelValue);
            }
        }
    });

    return labels.join(', ');
}

function extractTags(record) {
    const tags = [];

    if (record['tag'] && record['tag'].trim()) {
        const splitTags = record['tag'].split(',').map(tag =>
            tag.trim().replace(/\s+/g, '_')
        );
        tags.push(...splitTags);
    }

    // Don't add Feature/Epic/Story since they're used for folders
    if (record['SubStory']) tags.push(record['SubStory'].trim().replace(/\s+/g, '_'));
    if (record['Test Type']) tags.push(record['Test Type'].trim().replace(/\s+/g, '_'));
    if (record['Automation Type']) tags.push(record['Automation Type'].trim().replace(/\s+/g, '_'));

    return tags.join(',');
}

function extractJiraIssues(record) {
    const jiraIssues = [];
    const jiraPattern = /([A-Z]+-\d+)/g;

    // Extract from jira-* columns and common fields
    const fieldsToCheck = Object.keys(record).filter(key =>
        key.toLowerCase().startsWith('jira-')
    ).concat(['link', 'References', 'description', 'expected_result']);

    fieldsToCheck.forEach(field => {
        if (record[field] && record[field].trim()) {
            const matches = record[field].match(jiraPattern);
            if (matches) {
                jiraIssues.push(...matches);
            }
        }
    });

    return [...new Set(jiraIssues)].join(', ');
}

function extractLinks(record) {
    return record['link'] && record['link'].trim() ? record['link'].trim() : '';
}

function cleanHtml(text) {
    if (!text) return '';
    return text
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/?(p|span|div|ul|li)[^>]*>/gi, '')
        .replace(/</g, '≺')
        .replace(/>/g, '≻')
        .replace(/\n\s*\n/g, '\n')
        .trim();
}

try {
    convertTestCases(inputFile, outputFile);
} catch (error) {
    console.error('Error during conversion:', error.message);
}
