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

function formatName(n) {
  if (typeof n !== 'undefined') {
    return `Team ${n}`; 
  }
  return 'To Be Determined'; 
}

function formatPos(n) {
  if (typeof n !== 'undefined') {
    return getOrdinal(n+1); 
  } else {
    return 'TBD';
  }
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
    let matchups = round.map(match => {
      return `<div class='bk-match-outer'>\
      <div class='bk-match-inner bk-match-top'><div class='bk-match-inner-main'>${formatName(match.t1)}</div><div class='bk-match-inner-sub'>${formatPos(match.t1)} seed</div></div>\
      <div class='bk-match-inner bk-match-btm'><div class='bk-match-inner-main'>${formatName(match.t2)}</div><div class='bk-match-inner-sub'>${formatPos(match.t2)} seed</div></div>\
      </div>`
    })
    out += `<section id='bk-round-${i+1}' class='bk-round'>${matchups.join('')}</section>`; 
  }
  console.log(out); 
  $('#bracket-outer').html(out); 
}

async function getBrackets() {
  let res = await fetch('data').then(r => r.json()); 
  renderBracket(res[0]);
  console.log(res); 
}

window.onload = getBrackets; 