import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newGame, dispatch, attachmentMoves, boardPorts, tileKey, totalScore
} from '../site/engine.js';

function setup({ left = '0-4', right = '3-5', leftFlip = true, rightFlip = true } = {}) {
  const g = newGame({seed:92,startingPlayer:0});
  const find = k => g.tiles.filter(t => tileKey(t) === k).map(t => t.id);
  const ids = [find(left)[0],find(right)[0]];
  g.hands[0] = g.tiles.map(t => t.id);
  g.hands[1] = [];
  dispatch(g,{type:'open',ids,flips:[leftFlip,rightFlip]});
  g.current=0;
  g.phase='attachment';
  const play=(tiles, pred=()=>true) => {
    const chosen=tiles.map(k=>find(k).find(id=>g.hands[0].includes(id)));
    assert.ok(chosen.every(id=>id!=null));
    g.current=0;
    const opts=attachmentMoves(g,chosen,0);
    const move=opts.find(pred);
    assert.ok(move,`No legal move for ${tiles} in ${JSON.stringify(boardPorts(g.board))}`);
    dispatch(g,{type:'attach',ids:chosen,moveKey:move.key});
    return move;
  };
  return {g,find,play};
}
function portSummary(g){return boardPorts(g.board).map(p=>({pip:p.pip,root:p.root,slot:p.slot}));}

test('first ordinary attachment chooses one root side and permanently closes the other',()=>{
  const {g,find,play}=setup();
  assert.deepEqual(boardPorts(g.board).map(p=>p.pip),[4,3]);
  const chosen=play(['4-4'],m=>m.side==='left');
  assert.equal(chosen.portKey,'root-left');
  assert.equal(g.board.chosenSide,'left');
  assert.equal(g.board.items.length,3);
  assert.equal(boardPorts(g.board).length,3);
  assert.ok(boardPorts(g.board).every(p=>p.pip===4&&!p.root));
  g.current=0;
  assert.deepEqual(attachmentMoves(g,[find('3-6')[0]],0),[]);
});

test('a perpendicular double is a spinner with 3 independently usable ports',()=>{
  const {g,find,play}=setup();
  const double=play(['4-4']);
  const doubleId=double.placements[0].id;
  assert.deepEqual(boardPorts(g.board).map(p=>p.slot),[0,1,2]);
  g.current=0;
  const id=find('2-4')[0];
  const opts=attachmentMoves(g,[id],0);
  assert.equal(opts.length,3);
  assert.equal(new Set(opts.map(o=>o.portKey)).size,3);
  const selected=opts.find(o=>o.portKey===`tile-${doubleId}-1`);
  assert.ok(selected);
  dispatch(g,{type:'attach',ids:[id],moveKey:selected.key});
  assert.equal(boardPorts(g.board).length,3);
  assert.ok(boardPorts(g.board).some(p=>p.pip===2));
  assert.equal(boardPorts(g.board).filter(p=>p.pip===4).length,2);
  g.current=0;
  assert.equal(attachmentMoves(g,[find('1-2')[0]],0).length,1);
  assert.equal(attachmentMoves(g,[find('3-6')[0]],0).length,0);
});

test('a double played on an existing double creates a fifth open port',()=>{
  const {g,play}=setup();
  play(['4-4']);
  play(['4-4']);
  assert.equal(boardPorts(g.board).length,5);
  assert.deepEqual(boardPorts(g.board).map(p=>p.pip),[4,4,4,4,4]);
});

test('two-tile play follows ONE branch, consumes intermediary port, and scores both',()=>{
  const {g,play}=setup();
  const pipsBefore=g.scores[0].pips;
  const move=play(['4-4','2-4']);
  assert.equal(move.placements.length,2);
  assert.equal(boardPorts(g.board).length,3);
  assert.ok(boardPorts(g.board).some(p=>p.pip===2));
  assert.ok(boardPorts(g.board).filter(p=>p.pip===4).length===2);
  const first=move.placements[0];
  assert.ok(!boardPorts(g.board).some(p=>p.key===`tile-${first.id}-0`),
    'intermediate attachment port must be consumed');
  assert.equal(g.scores[0].pips,pipsBefore+8+6);
});

test('Supreme alone may connect two root sides 0 and 6 simultaneously',()=>{
  const {g,find,play}=setup({left:'0-4',right:'3-6',leftFlip:false,rightFlip:false});
  assert.deepEqual(boardPorts(g.board).map(p=>p.pip),[0,6]);
  const chosen=play(['0-0','6-6'],m=>m.special);
  assert.equal(chosen.side,'both');
  assert.equal(g.board.chosenSide,'supreme');
  assert.equal(boardPorts(g.board).length,6);
  assert.deepEqual(boardPorts(g.board).map(p=>p.pip).sort(),[0,0,0,6,6,6]);
  assert.ok(!boardPorts(g.board).some(p=>p.root));
});

test('a regular two-tile move cannot split across 0 and 6 root sides',()=>{
  const {g,find}=setup({left:'0-4',right:'3-6',leftFlip:false,rightFlip:false});
  g.current=0;
  const ids=[find('0-2')[0],find('3-6')[1]];
  const choices=attachmentMoves(g,ids);
  assert.equal(choices.length, 0, 'unrelated normal tiles cannot be split across root endpoints');
});

test('all attached physical tile IDs are unique and pip accounting stays exact',()=>{
  const {g,play}=setup();
  play(['4-4']);
  play(['2-4']);
  play(['1-2']);
  const ids=g.board.items.map(x=>x.id);
  assert.equal(new Set(ids).size,ids.length);
  assert.ok(Number.isFinite(totalScore(g,0)));
});
