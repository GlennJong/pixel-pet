const fs = require('fs');
const path = require('path');

const roomData = JSON.parse(fs.readFileSync('public/assets/config/pet/room.json', 'utf8'));

const animations = roomData.animations;

const newList = [];

roomData.list.forEach(item => {
  const v = item.value;
  const fileName = `${v}.json`;
  
  const childJson = {
    key: roomData.key,
    animations: animations, // maybe keep animations here or in main? The new logic needs it when reloading
    background: item.background,
    back: item.back,
    front: item.front,
    extras: item.extras || []
  };

  fs.writeFileSync(`public/assets/config/pet/room/${fileName}`, JSON.stringify(childJson, null, 2));

  newList.push({
    value: v,
    key: roomData.key,
    configFile: `config/pet/room/${fileName}`
  });
});

const indexJson = {
  watch: roomData.watch,
  list: newList,
  defaultKey: roomData.key
};

fs.writeFileSync('public/assets/config/pet/room.json', JSON.stringify(indexJson, null, 2));

console.log('Done splitting room.json');
