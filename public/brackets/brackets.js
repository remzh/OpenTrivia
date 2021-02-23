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

function formatName(n, index) {
  if (typeof n !== 'undefined') {
    // return `<span class='fa-layers fa-fw'><i class='fas fa-circle' style='color: #fff000'></i><i class='fas fa-heart' style='color: tomato' data-fa-transform='shrink-6'></i></span> Team ${n} Fjalj FDjieo MEewio Faiww`; 
    return `Team ${n}`; 
  }
  if (typeof index !== 'undefined') {
    // return `Game ${index+1}`;
    return ''; 
  }
  return 'TBD'; 
}

function formatPos(n) {
  if (typeof n !== 'undefined') {
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
    console.log(i, index);
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
 * @returns {undefined}
 */
function renderBracket(data, names) {
  let out = ''; 
  for (let i = 0; i < data.length; i++) {
    let round = data[i]; 
    let matchups = round.map((match, index) => {
      return `<div class='bk-match-outer' style='margin-top: ${calcMatchOffset(i, index)}'>\
      <div class='bk-match-inner bk-match-top'><div class='bk-match-inner-main'>${formatName(match.t1, index)}</div><div class='bk-match-inner-score'>${24}</div><div class='bk-match-inner-sub'>${formatPos(match.t1)}</div></div>\
      <div class='bk-match-inner bk-match-btm'><div class='bk-match-inner-main'>${formatName(match.t2, index)}</div><div class='bk-match-inner-score'>${24}</div><div class='bk-match-inner-sub'>${formatPos(match.t2)}</div></div>\
      </div>`
    })
    out += `<section id='bk-round-${i+1}' class='bk-round'>${matchups.join('')}</section>`; 
    if (i < data.length - 1) {
      out += `<section id='bk-spacer-${i+1}' class='bk-spacer'>${renderSpacingTemplate(SPACING_TEMPLATES.expanded[i])}</section>`; 
    }
  }
  console.log(out); 
  $('#bracket-inner').html(out); 
}

async function getBrackets() {
  let res = await fetch('data').then(r => r.json()); 
  renderBracket(res[0]);
  console.log(res); 
}

window.onload = getBrackets; 