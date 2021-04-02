function getType(i) {
  switch (i) {
    case 'T': 
      return 'Teacher Team'; 
    case 'S': 
      return 'Student Team';
    case 'N': 
      return 'Non-Fossil Student Team';
    case 'A': 
      return 'Alumni Team';
    default: 
      return 'Unknown';
  }
}

/**
 * Returns a color for that rank
 * @param {number} dec - value from 0.0 to 1.0 where 0.0 is first place and 1.0 is last place
 */
function getGradient(dec, a) {
  // if (dec === 0) return '55ff5d'
  if (isNaN(dec)) return `hsla(0, 0%, 0%, ${a})`; // invalid
  return `hsla(${Math.round(127-120*dec)}, 60%, 35%, ${a})`
}

window.onload = async function() {
  const urlParams = new URLSearchParams(location.search);
  if (urlParams.get('iframe') === '1') {
    $('#a-landing').hide(); 
  }

  let scores = await fetch('/scores/data').then(r => r.json()); 
  if (!scores.ok) {
    $('#s-load').html(`<i class='fas fa-exclamation-triangle'></i> Failed to load: ` + scores.error); 
    return; 
  } else if(!scores.scores) {
    $('#s-load').hide(); 
    $('#s-none').show(); 
  }
  let res = scores.scores; 
  let out = `<thead><tr><th>Team</th>${res.rounds.map(r => `<th class='scores-round'>R${r}</th>`).join('')}<th>Rank</th></tr></thead><tbody>`; // construct heading
  let numTeams = res.data.length; 

  if (scores.team) {
    $('#s-team-msg b').text(scores.team.TeamName); 
    $('#s-team-msg').show(); 
  } else {
    $('#s-signin').show(); 
  }

  res.data.forEach(team => {
    let indiv = team.i.map(item => {
      let e = item.r; 
      if (typeof item.s !== 'undefined' && e !== -1) {
        return `<td tabindex='0' ${e === -1?'':`style='background-color: ${getGradient((e-1)/(numTeams-1), 0.4)}'`}><span class='scores-rank-sm'>${e}</span><div class='scores-det'><div class='scores-pts'>${Number(item.s).toLocaleString()}</div><div><span class='scores-cor' title='# of Correct Questions: ${item.c}'>${item.c}</span> | <span class='scores-tb' title='Tiebreaker Score: ${item.tb}'>${item.tb<100?item.tb.toFixed(1):Math.round(item.tb)}</span></div></td>`;   
      }
      return `<td ${e === -1?'':`style='background-color: ${getGradient((e-1)/(numTeams-1), 0.4)}'`}><span class='scores-rank'>${e === -1 ? '-':`${e}`}</span></td>`;
    }).join(''); 
    out += `<tr${team.hl?` class='hl'`:''}><td><span class='scores-team-sub'>${getType(team.t)}</span><br/><span class='scores-team'>${team.tn}</span></td>${indiv}<td${team.s.c?` tabindex=0`:''} ${team.r === -1?'':`style='background-color: ${getGradient((team.r-1)/(numTeams-1), 0.75)}'`}><span class='scores-rank-sm'>${team.r}</span><br/><div class='scores-det'><div class='scores-pts'>${Number(team.s.s).toLocaleString()}</div>${team.s.c?`<div><span class='scores-cor' title='# of Correct Questions: ${team.s.c}'>${team.s.c}</span> | <span class='scores-tb' title='Tiebreaker Score: ${team.s.tb}'>${team.s.tb<100?team.s.tb.toFixed(1):Math.round(team.s.tb)}</span>`:''}</div></div></td></tr>`;
  })
  out += '</tbody>'; 
  // $('#scores-lu').text(moment().format('h:mm:ss a'))
  $('#s-load').hide(); 
  $('#scores-table').html(out); 
}; 