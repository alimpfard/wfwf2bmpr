all: clean
	{ node convert.js ${ARGS} 3>&1 2>&3 1>&2; } 3>out.json | tee log

clean:
	rm out.json converted.bmpr || true

generate_unsupported_list:
	grep 'ControlType::Match' log | cut -f12- -d' ' | sort | uniq > unsupported
