(function(root){
  function normalizeBareMath(text) {
    const protectedParts = /(```[\s\S]*?```|`[^`\n]*`|\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|\$[^$\n]+\$)/g;
    return text.split(protectedParts).map((part,index)=>index%2?part:part.replace(/δ([A-Za-z])\s*=\s*Δ\1\s*\/\s*\\*\|\s*\1\s*\\*\|/gu,(_,variable)=>'\\(\\delta '+variable+' = \\frac{\\Delta '+variable+'}{\\lvert '+variable+'\\rvert}\\)')).join('');
  }
  if(typeof module==='object' && module.exports)module.exports={normalizeBareMath};else root.normalizeBareMath=normalizeBareMath;
})(typeof window==='object'?window:globalThis);
