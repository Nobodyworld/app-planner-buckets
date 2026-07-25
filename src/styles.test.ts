// @ts-expect-error Vitest executes this source-contract test in Node, while app code omits Node types.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const stylesheet = readFileSync('src/styles.css', 'utf8');

const cssRule = (selector: string, occurrence = 0) => {
    const escapedSelector = selector
        .trim()
        .split(/\s+/)
        .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('\\s*');
    const matches = [...stylesheet.matchAll(new RegExp(`${escapedSelector}\\s*\\{`, 'g'))];
    const selectedStart = matches.at(occurrence)?.index ?? -1;
    expect(selectedStart).toBeGreaterThanOrEqual(0);
    const end = stylesheet.indexOf('}', selectedStart);
    return stylesheet.slice(selectedStart, end + 1);
};

describe('bucket drop slot layout contract', () => {
    it('keeps the wrapper at a zero flex footprint in every visual state', () => {
        const wrapper = cssRule('.bucket-drop-slot-wrapper');

        expect(wrapper).toMatch(/flex:\s*0 0 0;/);
        expect(wrapper).toMatch(/width:\s*0;/);
        expect(wrapper).toMatch(/min-width:\s*0;/);
        expect(wrapper).toMatch(/margin:\s*0;/);
        expect(wrapper).toMatch(/padding:\s*0;/);

        for (const selector of [
            '.bucket-drop-slot.visible',
            '.bucket-drop-slot.active',
            '.bucket-drop-slot.settled',
        ]) {
            expect(cssRule(selector)).not.toMatch(/\b(?:flex|width|min-width|margin|padding)\s*:/);
        }
    });

    it('uses an absolute hitbox and keeps active target effects from translating columns', () => {
        const slot = cssRule('.bucket-drop-slot', -1);

        expect(slot).toMatch(/position:\s*absolute;/);
        expect(slot).toMatch(/left:\s*50%;/);
        expect(slot).toMatch(/width:\s*var\(--bucket-insert-hitbox-width\);/);
        expect(cssRule('.bucket-column.bucket-drop-nudge-left')).not.toMatch(/\btransform\s*:/);
        expect(cssRule('.bucket-column.bucket-drop-nudge-right')).not.toMatch(/\btransform\s*:/);
        expect(cssRule('.interaction-drop-slot,\n.drop-slot,\n.bucket-drop-slot')).not.toMatch(/\bwidth\s+var\(--motion/);
    });
});

describe('board zoom coordinate contract', () => {
    it.each([
        ['.board-stage.board-zoom-70', '0.7'],
        ['.board-stage.board-zoom-75', '0.75'],
        ['.board-stage.board-zoom-80', '0.8'],
        ['.board-stage.board-zoom-85', '0.85'],
        ['.board-stage.board-zoom-90', '0.9'],
        ['.board-stage.board-zoom-95', '0.95'],
        ['.board-stage.board-zoom-100', '1'],
        ['.board-stage.board-zoom-105', '1.05'],
        ['.board-stage.board-zoom-110', '1.1'],
    ])('maps %s to scale %s', (selector, scale) => {
        expect(cssRule(selector)).toMatch(new RegExp(`--board-zoom:\\s*${scale.replace('.', '\\.')};`));
    });

    it('keeps zoom as a board transform so pointer and column rectangles share viewport coordinates', () => {
        const board = cssRule('.board');

        expect(board).toMatch(/transform:\s*scale\(var\(--board-zoom\)\);/);
        expect(board).toMatch(/transform-origin:\s*top left;/);
    });
});

describe('board scroll ownership contract', () => {
    it('makes the focusable board frame the two-axis outer scroll owner', () => {
        const frame = cssRule('.board-frame');

        expect(frame).toMatch(/height:\s*100%;/);
        expect(frame).toMatch(/min-height:\s*0;/);
        expect(frame).toMatch(/overflow:\s*auto;/);
        expect(frame).not.toMatch(/overflow-y:\s*hidden;/);
    });

    it('preserves independent vertical task-list scrolling', () => {
        const taskList = cssRule('.task-list');

        expect(taskList).toMatch(/max-height:\s*clamp\(360px,\s*74vh,\s*1100px\);/);
        expect(taskList).toMatch(/overflow-y:\s*auto;/);
    });
});

describe('bucket header containment contract', () => {
    it('lets the title region shrink and wrap without forcing a fixed width', () => {
        const title = cssRule('.bucket-title-block');
        const heading = cssRule('.bucket-header h2');

        expect(title).toMatch(/min-width:\s*0;/);
        expect(title).toMatch(/flex:\s*1 1 auto;/);
        expect(title).not.toMatch(/white-space:\s*nowrap;/);
        expect(title).not.toMatch(/\n\s*width\s*:/);
        expect(heading).toMatch(/overflow-wrap:\s*anywhere;/);
        expect(heading).not.toMatch(/white-space:\s*nowrap;/);
        expect(heading).not.toMatch(/\n\s*(?:min-)?width\s*:/);
    });

    it('bounds all actions in a four-column grid without escaping the header', () => {
        const actions = cssRule('.bucket-actions');

        expect(actions).toMatch(/flex:\s*0 0 auto;/);
        expect(actions).toMatch(/display:\s*grid;/);
        expect(actions).toMatch(/grid-template-columns:\s*repeat\(4,\s*28px\);/);
        expect(actions).toMatch(/gap:\s*4px;/);
        expect(actions).toMatch(/align-content:\s*start;/);
        expect(actions).not.toMatch(/position:\s*absolute;/);
        expect(actions).not.toMatch(/display:\s*none;/);
        expect(actions).not.toMatch(/white-space:\s*nowrap;/);
    });

    it('preserves the existing narrow bucket-width contract', () => {
        const narrowBucket = cssRule('.bucket-column', -1);

        expect(narrowBucket).toMatch(/width:\s*min\(86vw,\s*340px\);/);
        expect(narrowBucket).toMatch(/min-width:\s*min\(86vw,\s*340px\);/);
    });
});

describe('bucket entrance animation contract', () => {
    it('keeps the base column rule free of entrance animation ownership', () => {
        const baseColumnEffects = cssRule('.bucket-column', 1);

        expect(baseColumnEffects).not.toMatch(/\banimation\s*:/);
        expect(baseColumnEffects).not.toMatch(/\banimation-delay\s*:/);
        expect(baseColumnEffects).not.toContain('reveal-column-opacity');
    });

    it('assigns reveal and stagger timing only to the explicit entrance class', () => {
        const entering = cssRule('.bucket-column.bucket-entering');

        expect(entering).toMatch(
            /animation:\s*reveal-column-opacity var\(--anim-column-reveal\)\s*var\(--ease-standard\) both;/,
        );
        expect(entering).toMatch(
            /animation-delay:\s*calc\(var\(--column-index\) \* var\(--stagger-column-step\)\);/,
        );
    });

    it('retains the global reduced-motion duration and iteration limits', () => {
        expect(stylesheet).toMatch(
            /@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*?animation-duration:\s*1ms !important;[\s\S]*?animation-iteration-count:\s*1 !important;/,
        );
    });
});
