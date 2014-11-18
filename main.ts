declare var d3:any;
declare var $:any;
declare var Highcharts:any;

var MIN_CORRELATION = 0.6;
var MAX_CORRELATION = 0.99;
var MIN_SAMPLE = 15;

var Stat = {
	mean: (x:number[]) => Stat.sum(x)/x.length,
	sum: (x:number[]) => {
		var s = 0;
		for(var i=0;i<x.length;i++) {
			s += x[i];
		}
		return s;
	},
	variance: (x:number[]) => {
		var mean = Stat.mean(x);
		return x.map(val => val - mean);
	},
	cov: (ivar,jvar) => {
		var s = 0;
		for(var i=0;i<ivar.length;i++) {
			s += ivar[i]*jvar[i];
		}
		return s;
	},
	cor: (idata,jdata) => {
		var ivar = Stat.variance(idata);
		var jvar = Stat.variance(jdata); 

		return Stat.cov(ivar,jvar) /
			Math.sqrt(Stat.cov(ivar,ivar) * Stat.cov(jvar,jvar));
	},
	removeNaN: (data) => {
		var keep = new Array(data[0].length);
		for(var i=0;i<keep.length;i++) {
			keep[i] = data.every(d => d[i]===d[i]);
		}
		for(var i=0;i<data.length;i++) {
			data[i] = $.grep(data[i],(_,inx)=>keep[inx]);
		}
		return data;
	},

	square: (x:number[]) => x.map(a => a * a)
};
function log(t) {
	console.log(t);
	$('#drop').text(t);
}
class Promise {
	todo:any[] = [];
	then(str, fn) {
		this.todo.push({fn:fn,str:str});
		return this;
	}
	go() {
		if(this.todo.length==0) {$("#drop").remove();return}
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
	get(x,y) {
		return this.arr[y*this.sx+x];
	}
	set(x,y,val) {
		this.arr[y*this.sx+x] = val;
	}
	getRow(y) {
		return [].slice.call(this.arr.subarray(y*this.sx,(y+1)*this.sx));
	}
}

class Map2 {
	names = [];
	ids = [];
	map = {};
	remove(inx) {
		this.names.splice(inx,1);
		this.map = {};
		this.names.forEach((n,i)=>this.map[i]=n);
	}
	getAddInx(name,id) {
		var inx = this.map[name];
		if(inx!==undefined) return inx;
		else {
			this.ids.push(id);
			return this.map[name] = this.names.push(name)-1
		}
	}
}

var countries,indicators,data,template;
var correlation:{x;y;c}[];
function handleFileSelect(evt) {
	evt.stopPropagation();
	evt.preventDefault();
	$('body').removeClass('dragging');
	evt = evt.originalEvent;
	var file = (evt.dataTransfer||evt.target).files[0];
	var reader = new FileReader();
	log("loading file...");
	reader.onload = function(e) {
		var arr;
		var countryCol,countryIDCol,indicatorCol,indicatorIDCol,dataCol;
		var promise = new Promise();
		promise.then("parsing csv", ()=> {
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
		}).then("adding options", ()=>{
			var csel = $('#csel')[0];
			countries.names.forEach((n,i) => csel.options.add(new Option(n,i)));
			var isel = $('#isel')[0];
			indicators.names.forEach((n,i) => isel.options.add(new Option(n,i)));
		}).then("correlating", ()=> {
			correlation = JSON.parse(localStorage.getItem("correlation")||false);
			if(!correlation) {
				correlation = [];
				for(var i=0;i<data.sy;i++) {
					promise.then("correlating "+i+"/"+data.sy, (i=>{
						for(var j=i+1; j < data.sy; j++) {
							var datas = [data.getRow(i),data.getRow(j)];
							Stat.removeNaN(datas);
							var sample = datas[0].length;
							var cor = Stat.cor.apply(null,datas);
							if(Math.abs(cor)>=MIN_CORRELATION
									&& Math.abs(cor)<=MAX_CORRELATION
									&& sample>=MIN_SAMPLE)
								correlation.push({x:i,y:j,s:sample,c:cor});
						}
					}).bind(this,i));
				}
				promise.then("sorting",()=> {
					correlation.sort((a,b) => Math.abs(a.c)-Math.abs(b.c));
				});
				promise.then("saving",()=> {
					localStorage.setItem("correlation",JSON.stringify(correlation));
				});
			}
			promise.then("done",()=> setTimeout("addCharts(24)",100));
		}).go();
	}
	reader.readAsText(file);
}

function output() {
	var country = +$('#csel')[0].value;
	var indicator = +$('#isel')[0].value;
	var str = '';
	if(country===-1) {
		countries.names.forEach((name,country) => {
			var d = data.get(country,indicator);
			if(!isNaN(d)) str += name+": "+d+"\n";
		});
		var d = countries.names.map((name,country) => data.get(country,indicator));
		$('#outputGraph').highcharts({
			chart:{type:'column'},
			title:{text:indicators.names[indicator]},
			subtitle:{text:'foobar'},
			xAxis: {
				categories: countries.names.filter((n,i)=>!isNaN(d[i])),
				title: 'by country',
				labels: { rotation:-90}
			},
			yAxis: { title:'foo'},
			tooltip: { formatter:function(){return this}},
			plotOptions: { column:{showInLegend:false}},
			series:[{data:d.filter(n=>!isNaN(n))}]
		});
	} else if(indicator === -1) {
		indicators.names.forEach((name,indicator) => {
			var d = data.get(country,indicator);
			if(!isNaN(d)) str += name+": "+d+"\n";
		});
	} else str = data.get(country,indicator);
	if(!str) str = 'no data'
	$('#output').text(str);
}

function addCharts(count) {
	if(count==0) return;
	var info = correlation.pop();
	var xname = indicators.names[info.x];// +'['+info.x+']';
	var yname = indicators.names[info.y];// +'['+info.y+']';
	var xid = indicators.ids[info.x].split(".");
	var yid = indicators.ids[info.y].split(".");
	//hack:only %
	if(xname.indexOf('%')<0||yname.indexOf('%')<0) return addCharts(count);
	//hack:no similar id
	if(xid[0]==yid[0]&&xid[1]==yid[1]&&xid[2]==yid[2]) return addCharts(count);
	if(Math.abs(info.x-info.y)<10) return addCharts(count);
	var xdata = data.getRow(info.x);
	var ydata = data.getRow(info.y);
	var d = Stat.removeNaN([xdata,ydata,countries.names]);
	xdata = d[0]; ydata = d[1]; var cnames = d[2];
	var container = template;
	template = template.clone().appendTo("#outputGraph");
	var re = /\s*\([^)]+\)/g; // remove parens
	container.children('.graph').highcharts({
        chart: {type: 'scatter',zoomType: 'xy'},
        title: {text: xname.replace(re,"")+ ' vs.<br>' + yname.replace(re,"")},
        subtitle: {text: 'Source: WDI'},
        xAxis: {
            title: {enabled: true,text: xname},
            startOnTick: true,
            endOnTick: true,
            showLastLabel: true
        },
        yAxis: {title: {text: yname}},
		legend: {enabled: false},
        plotOptions: {
            scatter: {
				tooltip: {
                    headerFormat: '',
                    pointFormat: '<b>{point.name}</b><br>'+ xname+': {point.x}<br>'+yname+': {point.y}'
                }
            }
        },
        series: [{
			data: cnames.map((name,country) => ({
				name:name,
				x:xdata[country],
				y:ydata[country]
			}))
		}]
	});
	container.css('visibility','visible').hide().fadeIn();
	setTimeout(addCharts.bind(null,count-1),500);
}

$('#csel').change(output);
$('#isel').change(output);
$(function() {
	template = $('#template').css('visibility','hidden');
	$(window).scroll(() => {
		if($(window).scrollTop() + $(window).height() >
				$(document).height() - 200) addCharts(12);
	});
	$('body')
		.on('dragover',evt => {
			evt.stopPropagation();
			evt.preventDefault();
			$('#drop').addClass('dragging');
		})
		.on('dragleave',evt => $('#drop').removeClass('dragging'))
		.on('drop',handleFileSelect);
});
