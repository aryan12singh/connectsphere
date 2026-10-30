const header = '| Test Case ID | Scenario | Preconditions | Test Layers | Key Assertions | Automated Evidence | Date of Creation |';

function currentSection(record) {
  const match = record.match(/^## Current Jira-aligned specification[^\n]*\n([\s\S]*?)(?=^## |$(?![\s\S]))/m);
  return match ? match[1] : '';
}

function parseCurrentCases(record) {
  const section = currentSection(record);
  if (!section.includes(header)) return [];
  const rows = section.split('\n').filter(line => /^\| TC-CS\d+-\d+ \|/.test(line));
  return rows.map(line => {
    const cells = line.split('|').slice(1, -1).map(cell => cell.trim());
    if (cells.length !== 7) throw new Error(`Expected 7 cells in current case row: ${line}`);
    const layerLocations = {};
    for (const segment of cells[3].split('<br><br>')) {
      const layer = segment.match(/\*\*(Unit|Integration|E2E)\*\*/)?.[1];
      const file = segment.match(/File: `([^`]+)`/)?.[1];
      if (layer) layerLocations[layer] = file || null;
    }
    return {
      id: cells[0],
      scenario: cells[1],
      layers: ['Unit', 'Integration', 'E2E'].filter(layer => cells[3].includes(`**${layer}**`)),
      layerCell: cells[3],
      layerLocations,
      assertions: cells[4],
      evidence: cells[5],
      created: cells[6],
    };
  });
}

module.exports = { currentSection, parseCurrentCases };
