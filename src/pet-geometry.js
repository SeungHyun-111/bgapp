const COMPACT_WIDTH=120, COMPACT_HEIGHT=164;
function compactOrigin(x,y,area) {
  return {x:Math.max(0,Math.min(area.width-COMPACT_WIDTH,Math.floor(x-20))),
    y:Math.max(0,Math.min(area.height-COMPACT_HEIGHT,Math.floor(y-40)))};
}
module.exports={COMPACT_WIDTH,COMPACT_HEIGHT,compactOrigin};
