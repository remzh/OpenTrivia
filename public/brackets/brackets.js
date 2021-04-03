/**
 * brackets.js - Client Side
 * (C) 2021 Ryan Zhang
 */

let seedData = []; 

// Shared across realtime.js and brackets.js (too small to warrant its own file)
const TEAMPHOTO_BASE_URL = `https://ryanz.blob.core.windows.net/triviaphotos/%t.jpg`; 

function _getTeamPhoto(tid) {
  return TEAMPHOTO_BASE_URL.replace('%t', tid); 
}

function _teamPhotoError(ele) {
  if (!ele.src || ele.src.indexOf('images/teamPhotoFallback.jpg') === -1) {
    ele.src = '../images/teamPhotoFallback.jpg';
  }
}

/**
 * Adds an ordinal suffix to a number
 * @param {number} i - input number
 * @returns {string} 
 */
function getOrdinal(i) {
  if (!i) i = 0;
  var j = i % 10,
    k = i % 100;
  if (j == 1 && k != 11) {
    return i + '<sup>st</sup>';
  }
  if (j == 2 && k != 12) {
    return i + '<sup>nd</sup>';
  }
  if (j == 3 && k != 13) {
    return i + '<sup>rd</sup>';
  }
  return i + '<sup>th</sup>';
}

function formatName(n, index, seed) {
  if (n !== -1 && typeof n !== 'undefined') {
    // return `<span class='fa-layers fa-fw'><i class='fas fa-circle' style='color: #fff000'></i><i class='fas fa-heart' style='color: tomato' data-fa-transform='shrink-6'></i></span> Team ${n} Fjalj FDjieo MEewio Faiww`; 
    if (seed) {
      return seed.tn; 
    } else {
      return `<i class='text-gray'>Bye Round</i>`; 
    }
    // return `Team ${n}`; 
  }
  if (typeof index !== 'undefined') {
    // return `Game ${index+1}`;
    return ''; 
  }
  return 'TBD'; 
}

/**
 * Pulls the score of a particular team in a particular match, and color codes it accordingly.
 * @param {object} match - match object from /brackets/data
 * @param {*} n - which one to return (1=upper, 2=lower)
 */
function formatScore(match, n) {
  let sel, other; 
  if (!match.scores) {
    sel = -1, other = -1; 
  } else if (n === 1) {
    sel = match.scores[0]; 
    other = match.scores[1]; 
  } else {
    sel = match.scores[1]; 
    other = match.scores[0]; 
  }
  if (sel === 0 || typeof sel === 'undefined') {
    return `<span class='text-gray'>-</span>`
  } else {
    if (sel > other) {
      return `<b class='text-green'>${sel}</b>`
    } else if (other > sel) {
      return `<span class='text-yellow'>${sel}</span>`
    }
    return `<span>${sel}</span>`
  }
}

function formatPos(n) {
  if (n !== -1 && typeof n !== 'undefined') {
    return getOrdinal(n+1) + ' seed'; 
  } else {
    return '';
  }
}

const MATCH_BASE_HEIGHT = 3; 
const SPACING_TEMPLATES = {
  expanded: [
    [[1], [2.5, 1], [2.5, 2], [2.5, 1], [2.5, 2], [2.5, 1], [2.5, 2], [2.5, 1], [7.5, 3], [2.5, 3], [2.5, 3], [2.5, 3]], 
    [[2.25], [5, 1], [5, 2], [5, 1], [3.25, 3], [2.5, 3], [3], [2.5, 1], [2.5, 2], [2.5, 1], [3.25, 3], [2.5, 3]], 
    [[4.75], [10, 1], [1, 3], [4.75], [2.5, 1], [2.75, 3], [1.5], [5, 1], [1.5, 3], [1.5], [1.5], [2.5, 1], [2.75, 3]]
  ]
}
const MATCH_OFFSET_HEIGHT = {
  expanded: [
    [0, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5], 
    [1.25, 3, 3, 3, 6.75, 0.5, 0.5, 0.5], 
    [3.75, 8, 3.75, 0.5, 2.25, 3, 2.5, 0.5, 0.5],
    [8.75, 4, 4, 2, 2, 2, 2.25, 2]
  ]
}

function calcMatchOffset(i, index) {
  if (MATCH_OFFSET_HEIGHT.expanded[i]) {
    let baseMod = MATCH_OFFSET_HEIGHT.expanded[i][index] * MATCH_BASE_HEIGHT; 
    return `calc(${baseMod}rem)`;
  }
  return 1.5; 
}

function renderSpacingTemplate(item) {
  if (!item) {
    return ''; 
  }
  let str = ''; 
  for (let i = 0; i < item.length; i++) {
    // gap = how many blocks high the empty "gap" should be, connector = height from top to bottom of connector div
    let connector = item[i][0], type = item[i][1]; 
    if (!type) {
      str += `<div class='bk-gap' style='height: ${connector*MATCH_BASE_HEIGHT}rem'></div>`; 
    } else if (type === 1) {
      str += `<div class='bk-connector' style='height: ${connector*MATCH_BASE_HEIGHT}rem'><div class='bk-cl'></div><div class='bk-cr'></div></div>`; 
    } else if (type === 2) {
      str += `<div class='bk-connector' style='height: ${connector*MATCH_BASE_HEIGHT}rem'><div class='bk-cl bk-nb bk-d'></div></div>`; 
    } else if (type === 3) {
      str += `<div class='bk-connector' style='height: ${connector*MATCH_BASE_HEIGHT}rem'><div class='bk-cl bk-nb bk-d'></div><div class='bk-cr bk-db'></div></div>`; 
    }
  }
  return str; 
}

/**
 * Renders a provided bracket.
 * @param {array} data - a single bracket from /brackets/data [(round) [{(matchup)}, {matchup}, ...]]
 * @param {array} seeds - array of which team is at what seed
 * @returns {undefined}
 */
function renderBracket(data, seeds) {
  let out = ''; 
  for (let i = 0; i < data.length; i++) {
    let round = data[i]; 
    let matchups = round.map((match, index) => {
      return `<div class='bk-match-outer' style='margin-top: ${calcMatchOffset(i, index)}'>\
      <div class='bk-match-inner bk-match-top' onclick='showTeamDetails(${match.seeds[0]})'><div class='bk-match-inner-main'>${formatName(match.seeds[0], index, seeds[match.seeds[0]])}</div><div class='bk-match-inner-score'>${formatScore(match, 1)}</div><div class='bk-match-inner-sub'>${formatPos(match.seeds[0])}</div></div>\
      <div class='bk-match-inner bk-match-btm' onclick='showTeamDetails(${match.seeds[1]})'><div class='bk-match-inner-main'>${formatName(match.seeds[1], index, seeds[match.seeds[1]])}</div><div class='bk-match-inner-score'>${formatScore(match, 2)}</div><div class='bk-match-inner-sub'>${formatPos(match.seeds[1])}</div></div>\
      </div>`
    })
    out += `<section id='bk-round-${i+1}' class='bk-round'>${matchups.join('')}</section>`; 
    if (i < data.length - 1) {
      out += `<section id='bk-spacer-${i+1}' class='bk-spacer'>${renderSpacingTemplate(SPACING_TEMPLATES.expanded[i])}</section>`; 
    }
  }
  out += `<section class='bk-spacer'></section>`
  $('#bracket-inner').html(out); 
}

let initialHTML = false; 
let bracketNames = ['Rocky Mountain Bracket', 'Mesa Verde Bracket', 'Black Canyon Bracket', 'Sand Dunes Bracket']; 
async function getBrackets(bracket) {
  if (!initialHTML) {
    initialHTML = $('#bracket-inner').html(); 
  }
  let res = await fetch(`data?bracket=${bracket}`).then(r => r.json()); 
  seedData = res.seeds; 
  renderBracket(res.data, res.seeds);
  $('#bracket-inner').prepend(`<h2>${bracketNames[bracket]}</h2><p>Scroll left/right to see the different rounds.<br/><a onclick='showBracketLanding()'>Return to Bracket Selection</a></p>`)
}

function showBracketLanding() {
  $('#bracket-inner').html(initialHTML); 
}

function init() {
  const urlParams = new URLSearchParams(location.search);
  if (urlParams.get('iframe') === '1') {
    $('#footer').hide(); 
    $('#bracket-outer').css('height', 'calc(100% - 82px)');
  }
}

async function queryTeamBracket() {
  $('#p-teamBracket').text('Please wait...'); 
  let res = await fetch(`findTeamBracket`).then(r => r.json()); 
  if (res.ok) {
    $('#p-teamBracket').html(`Hi <span class='text-blue'>${res.tn}</span>! You're in the <b class='text-green'>${bracketNames[res.bracketIndex]}</b>.`); 
  } else if (res.msg) {
    $('#p-teamBracket').text(res.msg); 
  } else {
    $('#p-teamBracket').text('Failed to fetch for an unknown reason.'); 
  }
}

function showBracketOverlay() {
  $('#bracket-overlay').show(); 
  setTimeout(() => {
    $('#bracket-overlay').css('opacity', 1); 
  }, 100); 
}

function hideBracketOverlay() {
  $('#bracket-overlay').css('opacity', 0); 
  setTimeout(() => {
    $('#bracket-overlay').hide(); 
  }, 320); 
}

function showTeamDetails(seed) {
  let team = seedData[seed]; 
  if (!team) {
    $('#bracket-overlay-inner').html(`<p>Team data missing.</p><button class='btn-lg' onclick='hideBracketOverlay()'>Dismiss</button>`)
  } else {
    $('#bracket-overlay-inner').html(`<h2><span class='text-blue' style='font-size: 1rem'>${team.t}</span><br/>${team.tn}</h2><p><b>Members:</b> ${team.tm}</p><div><img src='${_getTeamPhoto(team.t)}' class='teamPhoto' onerror='_teamPhotoError(this)'/></div><br/><button class='btn-lg' onclick='hideBracketOverlay()'>Dismiss</button>`); 
  }
  showBracketOverlay(); 
}

window.onload = init; 