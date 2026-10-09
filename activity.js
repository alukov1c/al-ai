async function recordActivity(pool,userId,messages=0) {
  await pool.query(`INSERT INTO user_activity(user_id,day,messages) VALUES($1,(now() AT TIME ZONE 'Europe/Belgrade')::date,$2)
    ON CONFLICT(user_id,day) DO UPDATE SET messages=user_activity.messages+EXCLUDED.messages`,[userId,messages]);
}
async function activitySummary(pool,userId) {
  const days=await pool.query(`SELECT to_char(d.day,'YYYY-MM-DD') AS day,a.day IS NOT NULL AS active,coalesce(a.messages,0)::int AS messages
    FROM generate_series((now() AT TIME ZONE 'Europe/Belgrade')::date-364,(now() AT TIME ZONE 'Europe/Belgrade')::date,interval '1 day') AS d(day)
    LEFT JOIN user_activity a ON a.user_id=$1 AND a.day=d.day::date ORDER BY d.day`,[userId]);
  const totals=(await pool.query('SELECT count(*)::int AS "activeDays",coalesce(sum(messages),0)::int AS messages FROM user_activity WHERE user_id=$1',[userId])).rows[0];
  return {days:days.rows,totals,timeZone:'Europe/Belgrade'};
}
module.exports={recordActivity,activitySummary};

function calculateStreaks(days,today) {
  const dayNumber=value=>Date.parse(value+'T00:00:00Z')/86400000;
  const todayNumber=dayNumber(today);
  const ordered=[...new Set(days.map(dayNumber).filter(day=>Number.isFinite(day)&&day<=todayNumber))].sort((a,b)=>a-b);
  let longest=0,run=0,previous=null;
  for(const day of ordered){run=previous!==null&&day===previous+1?run+1:1;longest=Math.max(longest,run);previous=day;}
  const current=previous!==null && previous>=todayNumber-1?run:0;
  return {current,longest,totalActiveDays:ordered.length};
}
async function activityStreaks(pool,userId) {
  const today=(await pool.query("SELECT to_char((now() AT TIME ZONE 'Europe/Belgrade')::date,'YYYY-MM-DD') AS today")).rows[0].today;
  const days=await pool.query("SELECT to_char(day,'YYYY-MM-DD') AS day FROM user_activity WHERE user_id=$1 AND day<=$2::date ORDER BY day",[userId,today]);
  return {...calculateStreaks(days.rows.map(row=>row.day),today),today,timeZone:'Europe/Belgrade'};
}
module.exports.calculateStreaks=calculateStreaks;
module.exports.activityStreaks=activityStreaks;
