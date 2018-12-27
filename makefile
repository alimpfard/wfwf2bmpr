all: clean
	{ node convert.js 3>&1 2>&3 1>&2; } 3>out.json | tee log

clean:
	rm out.json converted.bmpr || true
