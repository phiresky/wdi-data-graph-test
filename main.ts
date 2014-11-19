declare var d3:any,$:any,Highcharts:any;
// source: ./main.ts
var MIN_CORRELATION = 0.6;
var MAX_CORRELATION = 0.99;
var MIN_SAMPLE = 15;
function calcCorrelation(x:number[],y:number[]) {
	var n = x.length;
	var sum_x = 0, sum_y = 0, sum_xy = 0, sum_xx = 0, sum_yy = 0;
	for(var i=0; i<n; ++i) {
		sum_x += x[i];
		sum_y += y[i];
		sum_xy += x[i] * y[i];
		sum_xx += x[i] * x[i];
		sum_yy += y[i] * y[i];
	}
	var covar = n * sum_xy - sum_x * sum_y;
	var var_x = n * sum_xx - sum_x * sum_x;
	var var_y = n * sum_yy - sum_y * sum_y;
	if(var_x == 0 || var_y == 0) return 0;
	else return covar / Math.sqrt(var_x * var_y);
}
function removeNaN(data1,data2,additional?) {
	var keep = new Array(data1.length);
	for(var i=0;i<keep.length;i++)
		keep[i] = !isNaN(data1[i])&&!isNaN(data2[i]);
	var odata1 = [], odata2 = [], oadditional = [];
	for(var inx = 0; inx < data1.length; inx++) {
		if(keep[inx]) {
			odata1.push(data1[inx]);
			odata2.push(data2[inx]);
			if(additional) oadditional.push(additional[inx]);
		}
	}
	return [odata1,odata2,oadditional];
}
function log(t) {
	console.log(t);
	$('#drop').text(t);
}
class Promise {
	todo:{fn;str}[] = [];
	then(str, fn) {
		this.todo.push({fn:fn,str:str});
		return this;
	}
	go() {
		if(this.todo.length==0) {return $("#drop").remove();return}
		var cur = this.todo.shift();
		log(cur.str+"...");
		setTimeout(()=>{cur.fn();this.go();},0);
	}
}
class Arr {
	arr: Float64Array;
	constructor(public sx, public sy, inp?:number[][]) {
		this.arr = new Float64Array(this.sx * this.sy);
		if(inp) for(var y=0;y<this.sy;y++) for(var x=0;x<this.sx;x++) {
			this.arr[y*this.sx+x] = inp[y][x];
		}
	}
	get = (x,y) => this.arr[y*this.sx+x];
	set = (x,y,val) => this.arr[y*this.sx+x] = val;
	getRow(y) {return <any>this.arr.subarray(y*this.sx,(y+1)*this.sx);}
}
class Map2 {
	names = []; ids = []; map = {};
	remove(inx) {
		this.names.splice(inx,1);
		this.map = {};
		this.names.forEach((n,i)=>this.map[i]=n);
	}
	getAddInx(name,id) {
		var inx = this.map[name];
		if(inx !== undefined) return inx;
		else {
			this.ids.push(id);
			return this.map[name] = this.names.push(name)-1
		}
	}
}

var countries:Map2,indicators:Map2,data:Arr,template;
var correlation:{x;y;c}[];
function parseData(e) {
	var arr,countryCol,countryIDCol,indicatorCol,indicatorIDCol,dataCol;
	var promise = new Promise();
	promise.then("parsing csv", ()=>{
		arr = d3.csv.parseRows((<any>e.target).result);
	}).then("removing headers", ()=>{
		var header = arr.shift(); // header
		countryCol = header.indexOf("Country Name");
		countryIDCol = header.indexOf("Country Code");
		indicatorCol = header.indexOf("Indicator Name");
		indicatorIDCol = header.indexOf("Indicator Code");
		dataCol = header.indexOf("2010");
	}).then("mapping, parsing floats", ()=>{
		countries = new Map2();
		indicators = new Map2();
		var map = [];
		arr.forEach(row => {
			var country = countries.getAddInx(row[countryCol],row[countryIDCol]);
			var indicator = indicators.getAddInx(row[indicatorCol],row[indicatorIDCol]);
			map[indicator] = map[indicator] || [];
			map[indicator][country] = parseFloat(row[dataCol]);
		});
		for(var i=0;i<map.length;i++) {
			var country = map[i];
			if(indicators.names.every((n,i)=>isNaN(country[i]))) {
				log("Indicator has no data: "+indicators.names[i]);
				indicators.remove(i);
				map.splice(i,1);
				i--;
			}
		}
		data = new Arr(map[0].length, map.length, map);
	}).then("correlating", ()=> {
		correlation = [];
		for(var i=0;i<data.sy;i++) {
			for(var j=i+1; j < data.sy; j++) {
				var datas = removeNaN(data.getRow(i),data.getRow(j));
				var sample = datas[0].length;
				var cor = calcCorrelation(datas[0],datas[1]);
				if(Math.abs(cor)>=MIN_CORRELATION
						&& Math.abs(cor)<=MAX_CORRELATION
						&& sample>=MIN_SAMPLE)
					correlation.push({x:i,y:j,s:sample,c:cor});
			}
		}
	}).then("sorting",()=>{
			correlation.sort((a,b) => Math.abs(a.c)-Math.abs(b.c));
	}).then("done",()=>addCharts(24)).go();
}
function handleFileSelect(evt) {
	evt.stopPropagation(); evt.preventDefault();
	var file = (evt.originalEvent.dataTransfer||evt.target).files[0];
	var reader = new FileReader();
	log("loading file...");
	reader.onload = parseData;
	reader.readAsText(file);
}

function addCharts(count) {
	if(count==0) return;
	var info = correlation.pop();
	var xname = indicators.names[info.x];// +'['+info.x+']';
	var yname = indicators.names[info.y];// +'['+info.y+']';
	var xid = indicators.ids[info.x].split(".");
	var yid = indicators.ids[info.y].split(".");
	if(location.search.indexOf('nohack')<0) {
		//hack:only %
		if(xname.indexOf('%')<0||yname.indexOf('%')<0) return addCharts(count);
		//hack:no similar id
		if(xid[0]==yid[0]&&xid[1]==yid[1]&&xid[2]==yid[2]) return addCharts(count);
	}
	if(Math.abs(info.x-info.y)<10) return addCharts(count);
	var xdata = data.getRow(info.x);
	var ydata = data.getRow(info.y);
	var d = removeNaN(xdata,ydata,countries.names);
	xdata = d[0]; ydata = d[1]; var cnames = d[2];
	var container = template;
	template = template.clone().appendTo("#outputGraph");
	var re = x => x.replace(/\s*\([^)]+\)/g,""); // remove parens
	container.children('.graph').highcharts({
		chart: {type: 'scatter', zoomType: 'xy'},
		title: {text: re(xname)+ ' vs.<br>' + re(yname)},
		xAxis: {title: {text: xname}},
		yAxis: {title: {text: yname}},
		legend: {enabled: false},
		plotOptions: { scatter: {
			tooltip: {
				headerFormat: '',
				pointFormat: '<b>{point.name}</b><br>'+ xname+': {point.x}<br>'
					+yname+': {point.y}'
			}
		}},
		series: [{
			data: cnames.map((name,country) => ({
				name:name,x:xdata[country],y:ydata[country]
			}))
		}]
	});
	container.css('visibility','visible').hide().fadeIn();
	setTimeout(addCharts.bind(null,count-1),500);
}
$(() => {
	template = $('#template');
	var win = $(window);
	win.scroll(() => {
		if(win.scrollTop() + win.height() > $(document).height() - 200) addCharts(12);
	});
	$('body').on('dragover',evt => {
		evt.stopPropagation(); evt.preventDefault();
		$('#drop').addClass('dragging');
	}).on('dragleave',evt => $('#drop').removeClass('dragging'))
	  .on('drop',handleFileSelect);
});
