/**
 * cv-parser.js — Free, local CV/Resume parser.
 * Supports: PDF (pdf-parse), DOCX (mammoth), plain text, website URL (axios+cheerio).
 * Extracts: name, email, phone, address, education, experience, skills, summary.
 */

// Polyfill File global — Electron's main process uses Node 18 which lacks it
if (typeof File === 'undefined') {
  global.File = class File {
    constructor(parts, name, opts = {}) {
      this.name = name;
      this.type = opts.type || '';
      this.size = (parts || []).reduce((a, b) => a + (b.length || b.byteLength || 0), 0);
      this.lastModified = opts.lastModified || Date.now();
    }
  };
}

const axios   = require('axios');
const cheerio = require('cheerio');

// ── Parse raw bytes by file type ─────────────────────────────────────────────

async function parseCV(buffer, ext) {
  switch ((ext || '').toLowerCase()) {
    case 'pdf':  return parsePDF(buffer);
    case 'docx':
    case 'doc':  return parseDOCX(buffer);
    default:     return buffer.toString('utf8');
  }
}

async function parsePDF(buffer) {
  try {
    const pdfParse = require('pdf-parse');
    const data = await pdfParse(buffer, { max: 0 });
    return data.text || '';
  } catch (e) {
    throw new Error(`PDF parsing failed: ${e.message}. Try a text-based PDF (not a scanned image).`);
  }
}

async function parseDOCX(buffer) {
  try {
    const mammoth = require('mammoth');
    const result  = await mammoth.extractRawText({ buffer });
    return result.value || '';
  } catch (e) {
    throw new Error(`DOCX parsing failed: ${e.message}`);
  }
}

async function parseCVFromUrl(url) {
  if (!url || !/^https?:\/\//i.test(url)) throw new Error('Invalid URL. Must start with http:// or https://');
  const resp = await axios.get(url, {
    timeout: 15000,
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CareerBuddyBot/1.0)' }
  });
  const $ = cheerio.load(resp.data);

  // Heuristic: remove nav/footer/header, find resume-like sections
  $('nav, footer, header, script, style, .cookie-banner, #cookie-consent').remove();

  // Priority selectors for portfolio resume sections
  const resumeSelectors = [
    '#resume', '#cv', '.resume', '.cv', '#about', '.about',
    '[class*="resume"]', '[class*="cv"]', '[id*="resume"]', '[id*="cv"]',
    'main', 'article', '.content', '#content', 'body'
  ];
  for (const sel of resumeSelectors) {
    const text = $(sel).first().text().trim();
    if (text.length > 200) return text;
  }
  return $('body').text().trim();
}

// ── Profile extractor from raw text ──────────────────────────────────────────

function extractProfile(rawText) {
  if (!rawText || rawText.trim().length < 30) return {};

  const text  = rawText;
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  return {
    personal:   extractPersonal(text, lines),
    address:    extractAddress(text, lines),
    education:  extractEducation(text, lines),
    experience: extractExperience(text, lines),
    skills:     extractSkills(text, lines),
    summary:    extractSummary(text, lines)
  };
}

// ── Personal Details ──────────────────────────────────────────────────────────

function extractPersonal(text, lines) {
  const email   = (text.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/)?.[0]) || '';
  const phone   = (text.match(/(?:\+91[\s\-]?)?[6-9]\d{9}|(?:\+\d{1,3}[\s\-]?)?\d{10}/)?.[0] || '').replace(/\s/g, '');
  const linkedin = (text.match(/linkedin\.com\/in\/([a-zA-Z0-9\-]+)/)?.[0]) ? `https://www.${text.match(/linkedin\.com\/in\/([a-zA-Z0-9\-]+)/)[0]}` : '';
  const portfolio = (text.match(/(?:https?:\/\/)?(?:www\.)?(?!linkedin)[a-zA-Z0-9\-]+\.(?:com|in|io|me|dev|co)[^\s]*/i)?.[0] || '').replace(/^(?!https?:\/\/)/, 'https://');

  // Name: first non-empty line that looks like a name (2-4 words, no special chars, not all-caps section header)
  let name = '';
  for (const line of lines.slice(0, 8)) {
    if (/^[A-Z][a-z]+([\s][A-Z][a-zA-Z]+){1,3}$/.test(line) && !/(resume|curriculum|vitae|cv|profile)/i.test(line)) {
      name = line; break;
    }
  }

  const nameParts = name.split(/\s+/);
  return {
    firstName:        nameParts[0] || '',
    lastName:         nameParts.slice(1).join(' ') || '',
    fullName:         name,
    email,
    phone:            phone.replace(/^\+91/, '').replace(/\D/g, '').slice(-10),
    phoneCountryCode: phone.startsWith('+') ? phone.match(/^\+\d{1,3}/)?.[0] || '+91' : '+91',
    linkedinUrl:      linkedin,
    portfolioUrl:     /linkedin/.test(portfolio) ? '' : portfolio
  };
}

// ── Address ───────────────────────────────────────────────────────────────────

function extractAddress(text, lines) {
  // Look for city/state patterns (Indian cities)
  const indianCities = ['bengaluru','bangalore','mumbai','delhi','hyderabad','chennai','pune','kolkata','ahmedabad','jaipur','noida','gurgaon','gurugram'];
  const indiaPattern = new RegExp(`(${indianCities.join('|')})`, 'i');

  let city = '', state = '', pincode = '', line1 = '';

  const cityMatch = text.match(indiaPattern);
  if (cityMatch) city = capitalize(cityMatch[1]);

  const pincodeMatch = text.match(/\b[1-9][0-9]{5}\b/);
  if (pincodeMatch) pincode = pincodeMatch[0];

  const stateMap = { bengaluru: 'Karnataka', bangalore: 'Karnataka', mumbai: 'Maharashtra', pune: 'Maharashtra', delhi: 'Delhi', hyderabad: 'Telangana', chennai: 'Tamil Nadu', kolkata: 'West Bengal', noida: 'Uttar Pradesh', gurgaon: 'Haryana', gurugram: 'Haryana' };
  if (city) state = stateMap[city.toLowerCase()] || '';

  // Try to find address line 1 from context around city
  for (const line of lines) {
    if (indiaPattern.test(line) && line.length > city.length + 3) {
      line1 = line.replace(indiaPattern, '').replace(/,\s*$/, '').trim();
      break;
    }
  }

  return { line1, line2: '', city, state, country: city ? 'India' : '', pincode };
}

// ── Education ─────────────────────────────────────────────────────────────────
// Only match strict degree acronyms — NOT generic words like "Engineering" or
// "Science" which appear heavily in TPM/tech job descriptions.

function extractEducation(text, lines) {
  const edu = [];

  // Strict degree patterns only — must be a real qualification abbreviation or full word
  const strictDegree = /\b(B\.?Tech|BE|B\.E|B\.?Sc|B\.?Com|BBA|MBA|PGDM|MCA|BCA|M\.?Tech|ME|M\.?E|M\.?Sc|M\.?Com|Ph\.?D|Bachelor(?:'s)?|Master(?:'s)?|Diploma|B\.?A\b|M\.?A\b|LLB|LLM|MBBS|B\.?Pharm|D\.?Pharm)\b/i;
  const yearRe       = /\b(19|20)\d{2}\b/g;
  const gradeRe      = /(\d{1,3}(?:\.\d+)?)\s*(%|CGPA|GPA|\/10|\/4)/i;

  // Step 1 — find the education section boundaries
  let eduStart = -1, eduEnd = lines.length;
  for (let i = 0; i < lines.length; i++) {
    if (eduStart === -1 && /^(education|academic qualifications?|educational background|qualifications?)$/i.test(lines[i])) {
      eduStart = i + 1;
    } else if (eduStart !== -1 && /^(work experience|experience|employment|professional|skills|projects|certifications|achievements|awards)/i.test(lines[i])) {
      eduEnd = i; break;
    }
  }

  // Step 2 — within the section, find degree lines
  const searchLines = eduStart !== -1 ? lines.slice(eduStart, eduEnd) : lines;

  for (let i = 0; i < searchLines.length && edu.length < 5; i++) {
    const line = searchLines[i];
    // Must be short enough to be a degree line (not a paragraph), and match a strict degree
    if (line.length > 120 || !strictDegree.test(line)) continue;

    const years      = line.match(yearRe) || [];
    const gradeMatch = line.match(gradeRe);

    // Institution: try the line before (if short enough to be an institution name)
    let institution = '';
    if (i > 0 && searchLines[i - 1].length < 80 && !strictDegree.test(searchLines[i - 1])) {
      institution = searchLines[i - 1];
    } else if (i + 1 < searchLines.length && searchLines[i + 1].length < 80 && !strictDegree.test(searchLines[i + 1]) && !/^\d{4}/.test(searchLines[i + 1])) {
      institution = searchLines[i + 1];
    }

    edu.push({
      institution: institution.substring(0, 80),
      degree:      line.replace(yearRe, '').replace(gradeRe, '').replace(/[–\-]\s*$/, '').trim().substring(0, 80),
      field:       '',
      startYear:   years[0] || '',
      endYear:     years[1] || '',
      grade:       gradeMatch ? gradeMatch[1] : '',
      gradeType:   gradeMatch ? (/cgpa|gpa/i.test(gradeMatch[2]) ? 'cgpa' : 'percentage') : 'percentage'
    });
  }

  return edu;
}

// ── Work Experience ───────────────────────────────────────────────────────────
// Uses section header detection + date-anchored entry splitting.
// Company lines are SHORT (< 60 chars). Descriptions are long — never used as company/title.

function extractExperience(text, lines) {
  const exp       = [];
  const monthRe   = /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/i;
  const yearRe    = /\b(19|20)\d{2}\b/;
  const dateLineRe= /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s,\-]+\d{4}/i;
  const currentRe = /\bpresent\b|\bcurrent\b|\btill date\b|\bto date\b|\bongoing\b/i;

  // ── Find experience section ───────────────────────────────────────────────
  let expStart = -1, expEnd = lines.length;
  for (let i = 0; i < lines.length; i++) {
    if (expStart === -1 && /^(work experience|experience|employment history|professional experience|career history|work history)$/i.test(lines[i])) {
      expStart = i + 1;
    } else if (expStart !== -1 && /^(education|academic|skills|projects|certifications|achievements|awards|publications|interests|references)/i.test(lines[i])) {
      expEnd = i; break;
    }
  }

  const searchLines = expStart !== -1 ? lines.slice(expStart, expEnd) : lines.slice(0, Math.min(lines.length, 200));

  // ── Split into job blocks by date-line anchors ────────────────────────────
  // A new job entry starts when we see a line with a month+year date range
  const entries = [];
  let current   = null;

  for (const line of searchLines) {
    if (line.length === 0) continue;

    const hasDate   = dateLineRe.test(line) || (monthRe.test(line) && yearRe.test(line));
    const isShort   = line.length < 70;
    const notDesc   = !/^[-•·▪✓✔]/.test(line); // bullet point = description

    if (hasDate && isShort) {
      // This is a date line — belongs to the current entry or starts a new block
      if (current) current.dateLine = line;
    } else if (isShort && notDesc && /[A-Z]/.test(line[0]) && line.length > 2) {
      // Short capitalised line = potential company or title
      if (!current) {
        current = { lines: [line], dateLine: '' };
        entries.push(current);
      } else if (current.lines.length === 1 && !current.company) {
        // Second short line after company = title
        current.lines.push(line);
      } else if (current.lines.length >= 2) {
        // Looks like a new entry
        current = { lines: [line], dateLine: '' };
        entries.push(current);
      }
    } else {
      // Long or bullet = description, skip for name/title purposes
      if (current && !current.desc) current.desc = line.substring(0, 200);
    }
  }

  for (const entry of entries.slice(0, 8)) {
    if (!entry.lines.length) continue;

    const company = entry.lines[0] || '';
    const title   = entry.lines[1] || '';
    if (!company && !title) continue;

    // Parse dates from dateLine
    let startMonth = '', startYear = '', endMonth = '', endYear = '', isCurrent = false;
    if (entry.dateLine) {
      isCurrent = currentRe.test(entry.dateLine);
      const parts = entry.dateLine.split(/[-–to]+/i).map(s => s.trim());
      const parseDate = (s) => {
        const mMatch = s.match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*/i);
        const yMatch = s.match(/\b(19|20)\d{2}\b/);
        const months = { jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12 };
        return {
          month: mMatch ? String(months[mMatch[0].toLowerCase().slice(0,3)] || '') : '',
          year:  yMatch ? yMatch[0] : ''
        };
      };
      if (parts[0]) { const d = parseDate(parts[0]); startMonth = d.month; startYear = d.year; }
      if (parts[1] && !currentRe.test(parts[1])) { const d = parseDate(parts[1]); endMonth = d.month; endYear = d.year; }
    }

    exp.push({ company, title, startMonth, startYear, endMonth, endYear, isCurrent, description: entry.desc || '' });
  }

  return exp;
}

// ── Skills ────────────────────────────────────────────────────────────────────

function extractSkills(text, lines) {
  let skillText = '';
  let inSkills  = false;

  for (const line of lines) {
    if (/^skills|technical skills|core competencies|key skills/i.test(line)) { inSkills = true; continue; }
    if (inSkills && /^(experience|education|projects|certifi)/i.test(line)) break;
    if (inSkills) skillText += ' ' + line;
  }

  if (!skillText) {
    const m = text.match(/skills[:\s]+([^\n]+(?:\n[^\n]+){0,5})/i);
    if (m) skillText = m[1];
  }

  return skillText
    .split(/[,|•\n·\/]/)
    .map(s => s.trim())
    .filter(s => s.length > 1 && s.length < 50)
    .slice(0, 40);
}

// ── Summary ───────────────────────────────────────────────────────────────────

function extractSummary(text, lines) {
  const m = text.match(/(?:summary|profile|objective|about me)[:\s\n]+([^]{50,600}?)(?:\n\n|\n[A-Z]{3})/i);
  if (m) return m[1].replace(/\s+/g, ' ').trim();
  return lines.slice(0, 5).join(' ').substring(0, 400);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : ''; }

function extractYear(dateStr) {
  const m = dateStr.match(/\d{4}/);
  if (m) return m[0];
  const shortM = dateStr.match(/\d{2}$/);
  return shortM ? (parseInt(shortM[0]) > 50 ? '19' : '20') + shortM[0] : '';
}

// ── Profile category detection ────────────────────────────────────────────────
// Returns 'tech' or 'non-tech' based on CV text and extracted skills.
function detectProfileCategory(rawText, skills = []) {
  const combined = ((rawText || '') + ' ' + skills.join(' ')).toLowerCase();

  const techSignals = [
    'software', 'developer', 'engineer', 'programming', 'coding', 'code',
    'python', 'java', 'javascript', 'typescript', 'c++', 'c#', 'golang', 'rust',
    'sql', 'nosql', 'mongodb', 'postgresql', 'mysql',
    'react', 'angular', 'vue', 'node', 'nodejs', 'express', 'django', 'flask',
    'aws', 'azure', 'gcp', 'google cloud', 'cloud', 'kubernetes', 'docker',
    'devops', 'ci/cd', 'jenkins', 'github actions',
    'machine learning', 'deep learning', 'data science', 'tensorflow', 'pytorch',
    'api', 'rest', 'graphql', 'microservices', 'architecture',
    'technical program', 'technical project', 'it project', 'it program',
    'infrastructure', 'network', 'security', 'cybersecurity', 'sysadmin',
    'full stack', 'frontend', 'backend', 'qa', 'testing', 'scrum', 'agile',
    'jira', 'confluence', 'git', 'linux', 'unix', 'bash', 'powershell'
  ];

  const score = techSignals.filter(k => combined.includes(k)).length;
  return score >= 4 ? 'tech' : (score >= 2 ? 'tech' : 'non-tech');
}

module.exports = { parseCV, parseCVFromUrl, extractProfile, detectProfileCategory };
