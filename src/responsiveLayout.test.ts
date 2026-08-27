// @ts-expect-error Vitest executes this source-contract test in Node, while app code omits Node types.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const responsiveStylesheet = readFileSync(
  'src/responsiveLayout.css',
  'utf8',
);
const mainSource = readFileSync('src/main.tsx', 'utf8');

describe('narrow responsive layout contract', () => {
  it('loads the high-specificity responsive corrections after the base stylesheet', () => {
    const baseImport = mainSource.indexOf("import './styles.css';");
    const responsiveImport = mainSource.indexOf(
      "import './responsiveLayout.css';",
    );

    expect(baseImport).toBeGreaterThanOrEqual(0);
    expect(responsiveImport).toBeGreaterThan(baseImport);
  });

  it('collapses both sidepanel states into one full-width column below 800px', () => {
    expect(responsiveStylesheet).toMatch(/@media \(max-width: 800px\)/);
    expect(responsiveStylesheet).toContain(
      '.workspace-layout.sidepanel-open .board-stage,',
    );
    expect(responsiveStylesheet).toContain(
      '.workspace-layout.sidepanel-closed .board-stage {',
    );
    expect(responsiveStylesheet).toMatch(
      /grid-template-columns:\s*minmax\(0,\s*1fr\);/,
    );
    expect(responsiveStylesheet).not.toContain('!important');
  });

  it('restores page scrolling and lets stacked grid children use the available width', () => {
    expect(responsiveStylesheet).toMatch(
      /body\s*\{[\s\S]*?overflow:\s*auto;/,
    );
    expect(responsiveStylesheet).toMatch(
      /\.board-stage-toolbar,[\s\S]*?\.sidepanel,[\s\S]*?\.board-frame\s*\{[\s\S]*?width:\s*100%;[\s\S]*?min-width:\s*0;/,
    );
  });
});
