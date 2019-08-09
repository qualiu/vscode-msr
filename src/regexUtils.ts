
'use strict';

export const NormalTextRegex = /^[\w\.:\\/-]+$/;
export const EmptyRegex: RegExp = new RegExp('^@#x$'); // Workaround for empty RegExp.

const AlphaNumber = "[a-z0-9A-Z]";
const HeaderBoundary = "(?<!" + AlphaNumber + ")";
const TailBoundary = "(?!" + AlphaNumber + ")";

// Extract single words (exclude "_")  which will split camel case and combination of word and numbers, like cases:
const SingleWordMatchingPattern =
	HeaderBoundary + "[A-Z]+[0-9]+[A-Z]?" + TailBoundary + "|"         // Get 'RL28D' 'OFFICE365'
	+ "[A-Z]?[a-z]+[0-9]+" + "|"                                       // Get 'Office365' 'office365'
	+ "[A-Z]+[a-z]" + "(?=[\\b_A-Z])" + "|"                            // Get 'IDEAs' from 'IDEAsOlsTest'
	+ "[A-Z][0-9][A-Z]" + "(?=[\\b_0-9]|[A-Z][a-z0-9])" + "|"          // Get 'U2D' from 'U2DUtils'
	+ "[A-Z]+[0-9]+[A-Z]" + "(?=[\\b_0-9]|[A-Z][a-z0-9])" + "|"        // Get 'RL28D' from 'RL28D_Office'
	+ "[A-Z]+[0-9]+" + "|"                                             // Get 'RL28' from 'RL28DEF'
	+ "[A-Z]+" + "(?=[A-Z][a-z]+)" + "|"                               // Get 'OFFICE' from 'OFFICEData'
	+ "[A-Z][a-z]+" + "|"                                              // Get 'Office'
	+ "[a-z][0-9][a-z]" + "(?=[\\b_A-Z0-9])" + "|"                     // Get 'u2d'
	+ "[0-9]+[A-Z]" + "(?=\\b|[A-Z])" + "|"                            // Get '3D' from '3DTest' '3DTEST'
	+ "[0-9]+" + "|" + "[A-Z]+" + "|" + "[a-z]+"                       // Get normal successive number or letters
	;
const SingleWordMatchingRegex = new RegExp(SingleWordMatchingPattern, 'g');

export function getAllSingleWords(text: string, ignoreCase: boolean = true): Set<string> {
	let s = new Set<string>();
	let m;
	do {
		m = SingleWordMatchingRegex.exec(text);
		if (m) {
			s.add(ignoreCase ? m[0].toLowerCase() : m[0]);
		}
	} while (m);

	return s;
}

export function escapeRegExp(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/"/g, '\\"');
}