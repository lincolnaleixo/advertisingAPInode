const applescript = require('applescript');


// const script = 'tell application "iTunes" to get name of selection';
const script = 'tell application "Messages"
	
	set myid to get id of first service
	
	set theBuddy to buddy "lincolnmorais@gmail.com" of service id myid
	
	send "Hi there" to theBuddy
	
end tell'

applescript.execString(script, (err, rtn) => {
  if (err) {
    // Something went wrong!
  }
  if (Array.isArray(rtn)) {
    for (const songName of rtn) {
      console.log(songName);
    }
  }
});

