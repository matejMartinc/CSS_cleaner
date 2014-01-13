
var compressor = require('node-minify');

var fs= require("fs");
var Map = require("collection").Map;
var Set = require("collection").Set;
var under=require('underscore');
under.str = require('underscore.string');
var request = require('request');
var async=require('async');
var jsdom = require("jsdom");
var css=require("css");

var jquery = fs.readFileSync("./jquery.js", "utf-8");
if(!process.argv[2]){
	console.log("You need to specify html file.");
	process.exit(code=0);
}
var url=process.argv[2];
var distance;
var deletion;
var simplification;
var compression;

if(process.argv[3]){
	distance=parseInt(process.argv[3])+1;
}	
else	
	distance=6;

if(!process.argv[4])
	deletion='deletionOn';
else
	deletion=process.argv[4];
if(!process.argv[5])
    simplification='simplificationOn';
else
	simplification=process.argv[5];

if(!process.argv[6])
	compression='compressionOff';
else
	compression=process.argv[6];


var jquerryConversion={};
var classes=new Set();
var logFile="";


main(url);

function main(url){
	jsdom.env({
  		url: url,
  		src: [jquery],
    	done: function (errors, window) {
    		if(!errors){
	    		
	    		try{
	    		    
	    		    var cssDoc=findCss(window, url);
	    		    
	    		    if(cssDoc.length==0){
	    		    	console.log("No css files were found.");
	    		    	process.exit(code=0);
	    		    }	

	    		}
	    		catch(err){
	    			console.log("Program appears to have crashed :(.");
	    		}    
	    		
	    		var bodies="";
	    		//this function concatenates content of all the css files found
	    		var f= function httpReq(url,callback){
					request(url,function (error, response, body) {
						if (!error && response.statusCode == 200) {
							bodies+=body;
							callback();
						}
						else{
							callback();
						}	
					});
				}
				async.each(cssDoc, f,function(err){
    				console.log('prevalidation');
    				bodies=prevalidation(bodies);
    				var obj=css.parse(bodies);
    				    
    				var sheet=obj.stylesheet;
					orderCssDoc(sheet);
					console.log('validation');
					logFile+="VALIDATION:___________________________________________________________________________\n\n\n";
    				validateSelectors(sheet,classes,distance);
					console.log('finding duplicates');
					logFile+="FINDING AND COMBINING/DELETING DUPLICATED DECLARATIONS:_______________________________\n\n\n";
    				findDuplicate(sheet);

    				if(deletion!='deletionOff'){
    					logFile+="DELETION OF UNUSED SELECTORS:_____________________________________________________\n\n\n";
    					deletion=true;
    				}
    				else
    					deletion=false;
    				if(deletion)
    					console.log("deletion of unused selectors");
    				delSelectors(sheet,window,deletion);
    				
    				
    				if(simplification!='simplificationOff'){
    					console.log('simplification');
				    	logFile+="SIMPLIFICATION OF SELECTORS:______________________________________________________\n\n\n";
				    	simplifySelectors(sheet, window);
				    }	
				    logFile+="CLASSES ON PAGE THAT ARE NOT DECLARED IN CSS:_________________________________________\n\n\n";
				    
				    var file=css.stringify(obj);
					fs.writeFileSync("optimizedCSS.css", css.stringify(obj));
					
				    getClasses(window,classes);
				    
				    if(compression!='compressionOff'){
					    new compressor.minify({
	    					type: 'yui-css',
	    					fileIn: "optimizedCSS.css",
	    					fileOut: "optimizedCSS.css",
	   					});
					}
					
					fs.writeFileSync("LogFile.txt", logFile);
					
				});
	    	}
		}
	});	
}


//checks the css file for empty selectors and deletes them, since css node module does not handle this.
function prevalidation(body){
	var array=[];
	//find all empty selectors and store their locations in array.
	var emptySelector=/\}\s*\{/g;
	var index=0;
	var newIndex=0;
	while((match=emptySelector.exec(body))!=null){
		index=match.index+match.length;
		array.push(index);	
	}
	//delete empty selectors
	for(var i=array.length-1;i>=0;i--){
		index=array[i];
		newIndex=index;
		do{
			newIndex++;
		}
		while(body.charAt(newIndex)!="}" || newIndex>=body.length);
		body=body.substring(0,index)+body.substring(newIndex+1);
	}
	return body;

}

//find all classes not defined in css
function getClasses(window,classes){
	var set=new Set();
	//find classes declared in html file
	window.$("[class]").each( function( index, element ){
	    var el=window.$( this ).attr('class');
	    var l=el.split(" ");
	    //check if classes are defined in css
	    for (i in l) {
	   	    if(l[i]!=undefined && !classes.has(l[i])){
	    		set.add(l[i]);
	    	}
  		}
	});
	//write undefined classes in logFile
	set.each(function(e){logFile+=(e+"\n\n");});
	
}

//find all combinations in a list
function combinations(list){
    var combinations = []; //All combinations
    var combination = [];  //Single combination
    var quantity = (1 << list.length);
    for (var i = 0; i < quantity ; i++){
        combination = [];
        for (var j=0;j<list.length;j++) {
            if ((i & (1 << j))){ 
                combination.push(list[j]);
            }
        }
        if (combination.length !== 0) {
            combinations.push(combination);
        }
    }
    return combinations;
}

//simplify overspecified selectors
function simplifySelectors(sheet,window){
	//check all not nested selectors
	for(i in sheet.rules){
	    var selectors=sheet.rules[i].selectors;
	    if(selectors!=undefined && selectors[0].charAt(0)!='@'){
			var selector;
			if(selectors.length>1)
				continue;//selector=selectors.join(",");
			else
				selector=selectors[0];
			sheet.rules[i].selectors=simple(selector, window).split(",");
			
		}
		//check nested selectors in @media rule
		else if(sheet.rules[i].type=='media'){
			for(j in sheet.rules[i].rules){
				var selectors=sheet.rules[i].rules[j].selectors;
				if(selectors!=undefined && selectors[0].charAt(0)!='@'){
					var selector;
					if(selectors.length>1)
						continue;//selector=selectors.join(",");
					else
						selector=selectors[0];
					sheet.rules[i].rules[j].selectors=simple(selector, window).split(",");
				}
			}
			
		}
		//check nested selectors in @document rule
		else if(sheet.rules[i].type=='document'){
			for(j in sheet.rules[i].rules){
				var selectors=sheet.rules[i].rules[j].selectors;
				if(selectors!=undefined && selectors[0].charAt(0)!='@'){
					var selector;
					if(selectors.length>1)
						continue;//selector=selectors.join(",");
					else
						selector=selectors[0];
					sheet.rules[i].rules[j].selectors=simple(selector, window).split(",");
					
				}
			}
			
		}
		//check nested selectors in @document rule
		else if(sheet.rules[i].type=='supports'){
			for(j in sheet.rules[i].rules){
				var selectors=sheet.rules[i].rules[j].selectors;
				if(selectors!=undefined && selectors[0].charAt(0)!='@'){
					var selector;
					if(selectors.length>1)
						continue;//selector=selectors.join(",");
					else
						selector=selectors[0];
					sheet.rules[i].rules[j].selectors=simple(selector, window).split(",");
				}
			}
			
		}
		
	}
	logFile+="\n\n";
}


//simplify overspecified selectors
function simple(selector,window){
	//remove unnecessary white space - required for upcoming operations on selector
	var list1=[];
	var jquerylist1=[]
	var removeWhiteSpace=[];
	selector=selector.trim();
	for (var j = 0; j < selector.length; j++) {
		if(selector[j]==" " && (selector[j-1] == ">" || selector[j-1] == "+" || selector[j-1] == "~" || selector[j-1] == ","  || selector[j+1] == ">" || selector[j+1] == "+" || selector[j+1] == "~" || selector[j+1] == "," ))
			removeWhiteSpace.push(j);
		}
	for(var j=removeWhiteSpace.length-1; j>=0; j--){
		selector=selector.substring(0,removeWhiteSpace[j])+selector.substring(removeWhiteSpace[j]+1);
	}
	removeWhiteSpace=[];
	//break selectors into simple selectors and save simple selectors in a list
	var dividers=/(\[.*?\]|[, >+~])/g;
	var word="";
	var jquerrySelector="";
	var a=0;
	var formerSelector="";
			
	while((match=dividers.exec(selector))!==null){
		var div=match[0];
		
		word=selector.substring(a,match.index);
		if(div.length<=1){
			if(word.length>0){
				list1.push(word+div);
				jquerylist1.push(convertCssToJquery(word+div, jquerryList));
			}
			if(formerSelector.length>0){
				list1.push(formerSelector+div);
				jquerylist1.push(convertCssToJquery(formerSelector+div, jquerryList));
				formerSelector="";
			}
		}
		if(div.length>1){
			if(word.length>0){
				formerSelector=word+div;
			}
			else{
				formerSelector=formerSelector+div;
			}
		}
		a=match.index+match[0].length;
	}
	word=selector.substring(a);
	if(word.length>0){
		list1.push(word);
		jquerylist1.push(convertCssToJquery(word, jquerryList));
	}	

	if(formerSelector.length>0){
		list1.push(formerSelector);
		jquerylist1.push(convertCssToJquery(formerSelector, jquerryList));
	}	
	var newSelector="";
	//create a list of all combinations of simple selectors in selectors
	if(list1.length<2)
		return selector;
	var list=combinations(list1);
	var jqueryTransform=combinations(jquerylist1);
	var realSelector=list[list.length-1].join("");
	var bestSelector=jqueryTransform[jqueryTransform.length-1].join("");
	try{
		var one=window.$(bestSelector);
	}
	catch(err){
		logFile+="Selector '"+realSelector+"' was not recognized as a valid selector by jquery.\n\n";
		return realSelector;
	}	
	
	//check if combination of simple selectors returns the same result as original selector
	for (var j=0;j<jqueryTransform.length-1;j++) {
		newSelector=jqueryTransform[j].join("");
		if(newSelector.charAt(newSelector.length-1)==' ' || newSelector.charAt(newSelector.length-1)=='>' || newSelector.charAt(newSelector.length-1)=='~' || newSelector.charAt(newSelector.length-1)=='+' || newSelector.charAt(newSelector.length-1)==',')
			newSelector=newSelector.substring(0,newSelector.length-1);
		var two=window.$(newSelector);
		var isEqual=true;
		if(one.length!=two.length)
			continue;
		for(var k=0;k<one.length;k++){
			if(one.get(k)!=two.get(k)){
				isEqual=false;
				break;
			}
		}
		//if result is the same and combination is shorter then original selector, switch original selector with combination
		if(isEqual){
			if(newSelector.length<bestSelector.length){
				bestSelector=newSelector;
				one=two;
				realSelector=list[j].join("");
				
				if(realSelector.charAt(realSelector.length-1)==' ' || realSelector.charAt(realSelector.length-1)=='>' || realSelector.charAt(realSelector.length-1)=='~' || realSelector.charAt(realSelector.length-1)=='+' || realSelector.charAt(realSelector.length-1)==',')
					realSelector=realSelector.substring(0,realSelector.length-1);
				
				
			}	
		}
	}
	list1=[];
	jquerylist1=[];
	if(selector.length>realSelector.length)
		logFile+="Replaced '"+selector+"' with '"+ realSelector+ "'.\n\n";
	//return shortest combination
	return realSelector;
}


//function that puts css rules from concatenated css files into correct order
function orderCssDoc(sheet){
	var charset=new Array();
	var imports=new Array();
	var namespace=new Array();
	var media=new Array();
	var et_rules=new Array();
	var rule=new Array();
	for (i in sheet.rules) {
		//find @charset rules and put them in a list
		if(sheet.rules[i].type=='charset'){
			charset.push(sheet.rules[i]);
		}
		//find @namespace rules and put them in a list
		else if(sheet.rules[i].type=='namespace'){
			namespace.push(sheet.rules[i]);
		}
		//find @import rules and put them in a list
		else if(sheet.rules[i].type=='import'){
			imports.push(sheet.rules[i]);
		}
		//find selectors
		else if(sheet.rules[i].selectors!=undefined && sheet.rules[i].selectors[0].charAt(0)=='@')
			et_rules.push(sheet.rules[i]);
		else{
			rule.push(sheet.rules[i]);
		}
		
	};
	//switch rules on wrong positions
	var counter=0;
	for(i in charset){
		sheet.rules[i]=charset[i];
		counter++;
		
	}
	for(i in imports){
		sheet.rules[counter]=imports[i];
		counter++;
		
	}
	for(i in namespace){
		sheet.rules[counter]=namespace[i];
		counter++;
		
	}
	for(i in et_rules){
		sheet.rules[counter]=et_rules[i];
		counter++;
		
	}
	for(i in rule){
		sheet.rules[counter]=rule[i];
		counter++;
		
	}


}


//delete unused selectors in css file
function delSelectors(sheet,window,deletion){
	var unusedSelectors=[];
	var unusedSelectorsm=[];
	var unusedSelectorsd=[];
	var unusedSelectorss=[];
	//check unnested and nested selectors and push them in an array if they are not used
	for (i in sheet.rules){
		var selectors=sheet.rules[i].selectors;
	    if(selectors!=undefined && selectors[0].charAt(0)!='@'){
			var selector;
			if(selectors.length>1)
				selector=selectors.join(",");
			else
				selector=selectors[0];
			if(delUnusedSelectors(window,selector,deletion)<0){
				
				unusedSelectors.push(i);
				logFile+=(selector+"\n\n");
			}
		}
		else if(sheet.rules[i].type=='media'){
			for(j in sheet.rules[i].rules){
				var selectors=sheet.rules[i].rules[j].selectors;
				if(selectors!=undefined && selectors[0].charAt(0)!='@'){
					var selector;
					if(selectors.length>1)
						selector=selectors.join(",");
					else
						selector=selectors[0];
					if(delUnusedSelectors(window,selector,deletion)<0){
						unusedSelectorsm.push(j);
						logFile+=(selector+"\n\n");
						
					}
				}
			}
			//delete nested selectors that are not used
			for(j=unusedSelectorsm.length-1; j>=0; j--){
				(sheet.rules[i].rules).splice(unusedSelectorsm[j],1);
			}
			
		}
		else if(sheet.rules[i].type=='document'){
			for(j in sheet.rules[i].rules){
				var selectors=sheet.rules[i].rules[j].selectors;
				if(selectors!=undefined && selectors[0].charAt(0)!='@'){
					var selector;
					if(selectors.length>1)
						selector=selectors.join(",");
					else
						selector=selectors[0];
					if(delUnusedSelectors(window,selector,deletion)<0){
						unusedSelectorsd.push(j);
						logFile+=(selector+"\n\n");
					}
				}
			}
			//delete nested selectors that are not used
			for(j=unusedSelectorsd.length-1; j>=0; j--){
				(sheet.rules[i].rules).splice(unusedSelectorsd[j],1);
			}
			
		}
		else if(sheet.rules[i].type=='supports'){
			for(j in sheet.rules[i].rules){
				var selectors=sheet.rules[i].rules[j].selectors;
				if(selectors!=undefined && selectors[0].charAt(0)!='@'){
					var selector;
					if(selectors.length>1)
						selector=selectors.join(",");
					else
						selector=selectors[0];
					if(delUnusedSelectors(window,selector,deletion)<0){
						unusedSelectorss.push(j);
						logFile+=(selector+"\n\n");
					}
				}
			}
			//delete nested selectors that are not used
			for(j=unusedSelectorss.length-1; j>=0; j--){
				(sheet.rules[i].rules).splice(unusedSelectorss[j],1);
			}
			
		}


	}
	//delete unnested selectors that are not used
	for(var i=unusedSelectors.length-1; i>=0; i--){
		(sheet.rules).splice(unusedSelectors[i],1);
	}
	logFile+="\n\n";

}

//checks if selectors in css file are used
function delUnusedSelectors(window,selector,deletion){
	try{
		var jqSelector=jquerryConversion[selector];
		//check if selector is not used and return -1 in that case
		if(deletion && window.$(jqSelector).length==0){
			return -1;
		}
	}
	//check if selector is corrupt and return -2 in that case
	catch(err){
		return -2;
	}
	//return 0 if selector is used
	return 0;	
}

//function that converts selectors into jquery compatible form if they are not allready compatible. This function is used in function simple 
//because jquery does not support event based pseudo classes and elements like ':hover'.  
function convertCssToJquery(selector,list){
	var end="";
	var dividers1=/[, >+~]/;
	var matchdiv=dividers1.exec(selector);
	if(matchdiv!==null){
		end=matchdiv[0];
		selector=selector.substring(0,matchdiv.index);
	}	
	var divproperties=/\[/;
	matchproperty=divproperties.exec(selector);
	var property="";
	var basic="";
	var specialSelector="";
	if(matchproperty!=null){
		property=selector.substring(matchproperty.index);
		selector=selector.substring(0,matchproperty.index);
	}
	var divSelector=/(::|:)/;
	matchSpecial=divSelector.exec(selector);
	if(matchSpecial!=null){
		specialSelector=selector.substring(matchSpecial.index);
		basic=selector.substring(0,matchSpecial.index);
	}
	else
		return selector+property+end;
	var div1=/:+/g;
	var a=0;
	var newSpecialSelector="";
	var jquerySpecialSelector="";
	var singleSpecialSelector="";
	var isJqueryCompatible=true;
	//check if there are more then one pseudo classes and elements in a 'specialSelector' string
	while((match1=div1.exec(specialSelector))!==null){
		//break combined pseudo classes and elements into parts
		singleSpecialSelector=specialSelector.substring(a,match1.index);
		if(singleSpecialSelector.length>0 && !under.str.startsWith(singleSpecialSelector,":-webkit") && !under.str.startsWith(singleSpecialSelector,":-moz")){
			//check for brackets and remove content inside brackets for easier comparison
			var div=/\(([^\)]*)\)+/;
			var insideBrackets="";
			var match2=div.exec(singleSpecialSelector);
			if(match2!=null){
				insideBrackets=match2[1];
				singleSpecialSelector=singleSpecialSelector.substring(0,match2.index+1)+singleSpecialSelector.substring(match2.index+match2[0].length-1);
			}
			//check if pseudo element or class is jquery compatible 
			if(list.indexOf(singleSpecialSelector)!=-1){
				isJqueryCompatible=false;
			}
			//restore content inside brackets
			if(insideBrackets!=""){
				var div=/\(/;
				match2=div.exec(singleSpecialSelector);
				if(match2!=null)
					singleSpecialSelector=singleSpecialSelector.substring(0, match2.index+1)+insideBrackets+singleSpecialSelector.substring(match2.index+1);
				}
		}
		a=match1.index;
		newSpecialSelector+=singleSpecialSelector;
		if(isJqueryCompatible)
			jquerySpecialSelector+=singleSpecialSelector;
		isJqueryCompatible=true;

	}
	//check for the part of the selector behind the last divider : or :: and do the same as in the upper while loop
	singleSpecialSelector=specialSelector.substring(a);
	if(singleSpecialSelector.length>0 && !under.str.startsWith(singleSpecialSelector,":-webkit") && !under.str.startsWith(singleSpecialSelector,":-moz") ){
		var div=/\(([^\)]*)\)+/;
		var insideBrackets="";
		var match2=div.exec(singleSpecialSelector);
		if(match2!=null){
			insideBrackets=match2[1];
			singleSpecialSelector=singleSpecialSelector.substring(0,match2.index+1)+singleSpecialSelector.substring(match2.index+match2[0].length-1);
		}
			
		if(list.indexOf(singleSpecialSelector)!=-1){
			isJqueryCompatible=false;
		}
		if(insideBrackets!=""){
			var div=/\(/;
			match2=div.exec(singleSpecialSelector);
			if(match2!=null)
				singleSpecialSelector=singleSpecialSelector.substring(0, match2.index+1)+insideBrackets+singleSpecialSelector.substring(match2.index+1);
		}
	}
	newSpecialSelector+=singleSpecialSelector;
	if(isJqueryCompatible)
		jquerySpecialSelector+=singleSpecialSelector;
	
	return basic+jquerySpecialSelector+property+end;	

	

}
//find all css files in html document and convert relative paths to absolute paths
function findCss(window,url){
	var cssDoc=[];
	//check for imported css file inside 'style' tag
	window.$( "style" ).each( function( index, element ){
	    var s=window.$( this ).html();
	    var path=/@import +(url *\()*["']([\/\.:A-Za-z0-9_-]*\.css[^'"]*)/g;
	    while((match=path.exec(s))!==null){
			if(!cssDoc.indexOf(match[2])>-1){
				cssDoc.push(match[2]);
			}
		}
	});
	//check for links to css files
	window.$( "link[rel='stylesheet']" ).each( function( index, element ){
	    var css=window.$( this ).attr("href");
		if(css!=undefined){
		    cssDoc.push(css);
		}				
	});
	logFile+="Program found next css files on the page: \n\n";
	//convert relative paths to absolute paths
	for (var i = 0; i < cssDoc.length; i++) {
		var css=cssDoc[i]+"\n";
		if(css!=undefined){
		    if(css.indexOf(url)==0 || css.substring(0,4) == "http"){
		    	logFile+=cssDoc[i]+"\n";
		    }
		    else if(css.charAt(0)=='/'){
		        cssDoc[i]=window.location.protocol+"//"+window.location.host+cssDoc[i];
		        logFile+=cssDoc[i]+"\n";
		    }
			else if(css.charAt(0)=='.' && css.charAt(1)=='.'){
				var path=window.location.href;
				var counter=0;
				for (var j = path.length-1; j >=0; j--) {
					if(path.charAt(j)=='/'){
						counter++;
						if(counter==2)
							path=path.substring(0,j);
					}
				}
				cssDoc[i]=path+cssDoc[i].substring(2);
				logFile+=cssDoc[i]+"\n";
			}
			else if(css.charAt(0)=='.' && css.charAt(1)=='/'){
				var path=window.location.href;
				for (var j = path.length-1; j >=0; j--) {
					if(path.charAt(j)=='/'){
						path=path.substring(0,j);
						break;
					}
				}
				cssDoc[i]=path+cssDoc[i].substring(1);
				logFile+=cssDoc[i]+"\n";			
			}
			else if(css.substring(0,4) != "http"){
				var path=window.location.href;
				for (var j = path.length-1; j >=0; j--) {
					if(path.charAt(j)=='/'){
						path=path.substring(0,j);
						break;
					}
				}
				cssDoc[i]=path+"/"+cssDoc[i];
				logFile+=cssDoc[i]+"\n";				
			}
		}

	};
	logFile+=("\n\n");
	return cssDoc;
}

//validate selectors
function validateSelectors(sheet,classes,distance){
	//find nested and unnested selectors and call 'validate' function
	for(i in sheet.rules){
	    var selectors=sheet.rules[i].selectors;
	    if(selectors!=undefined && selectors[0].charAt(0)!='@'){
			var selector;
			if(selectors.length>1)
				selector=selectors.join(",");
			else
				selector=selectors[0];
			sheet.rules[i].selectors=validate(selector, classes, distance).split(',');
		}
		
		else if(sheet.rules[i].type=='media'){
			for(j in sheet.rules[i].rules){
				var selectors=sheet.rules[i].rules[j].selectors;
				if(selectors!=undefined && selectors[0].charAt(0)!='@'){
					var selector;
					if(selectors.length>1)
						selector=selectors.join(",");
					else
						selector=selectors[0];
					sheet.rules[i].rules[j].selectors=validate(selector, classes, distance).split(',');
				}
			}
		}
		else if(sheet.rules[i].type=='document'){
			for(j in sheet.rules[i].rules){
				var selectors=sheet.rules[i].rules[j].selectors;
				if(selectors!=undefined && selectors[0].charAt(0)!='@'){
					var selector;
					if(selectors.length>1)
						selector=selectors.join(",");
					else
						selector=selectors[0];
					sheet.rules[i].rules[j].selectors=validate(selector, classes, distance).split(',');
				}
			}
			
		}
		else if(sheet.rules[i].type=='supports'){
			for(j in sheet.rules[i].rules){
				var selectors=sheet.rules[i].rules[j].selectors;
				if(selectors!=undefined && selectors[0].charAt(0)!='@'){
					var selector;
					if(selectors.length>1)
						selector=selectors.join(",");
					else
						selector=selectors[0];
					sheet.rules[i].rules[j].selectors=validate(selector, classes, distance).split(',');
				}
			}
			
		}
	}
	logFile+="\n\n";	
}

//validate selectors
function validate(selector,classes, distance){
	var array;
	var logSelector=selector;
	//remove comments from selector
	var comment="";
	var commentdiv=/\/\*.*\*\//g;
	var counter=0;
	while((matchcomment=commentdiv.exec(selector))!==null){
		comment+=matchcomment[0];
		selector=selector.substring(counter,matchcomment.index)+selector.substring(matchcomment.index+matchcomment[0].length);
		counter=matchcomment.index+matchcomment[0].length;
	}
	//find duplicated dividers and delete them
	selector=selector.replace(/\s+/g, " ");
	selector=selector.replace(/\n+/g, "\n");
	selector=selector.replace(/\++/g, "+");
	selector=selector.replace(/>+/g, ">");
	selector=selector.replace(/~+/g, "~");
	//break selector into simple selectors and attributes
	var dividers=/(\[.*?\]|[, >+~])/g;
	var properties=/\[.*\]/g;
	var match= [];
	var word="";
	var newSelector="";
	var jquerrySelector="";
	var a=0;
	var formerdiv="";
	var newWord="";
	while((match=dividers.exec(selector))!==null){
		var div=match[0];
		
		word=selector.substring(a,match.index);
		//check simple selector structure: is it class, identifier, does it have pseudo class...
		array=checkSelectorStructure(word, special, classes, distance, jquerryList);
		if(distance>0){		
			if(array[0]!="")
				newWord=checkSelectorParts(array[0], el, distance); //check if basic simple selector is legit
			else
				newWord="";
		}
		else
			newWord=array[0];
		newSelector+=newWord+array[1]+array[2];
		//convert selector to jquery compatible mode
		jquerrySelector+=newWord+array[1]+array[3];
		a=match.index+div.length;
		//check selector attribute
		if(div.length>1){
			var attributeReturn="";
			var attributeReturn=checkSelectorAtributes(newWord,div,el,classes, distance);
			div=attributeReturn;
		}
		newSelector+=div;
		jquerrySelector+=div;
		formerdiv=div;

	}
	//check for the part of the selector behind the last divider and do the same as in the upper while loop
	word=selector.substring(a);
	array=checkSelectorStructure(word, special, classes, distance, jquerryList);
	if(distance>0){
		if(array[0]!="")
			newWord=checkSelectorParts(array[0], el, distance);
		else
			newWord="";
	}
	else
		newWord=array[0];
	newSelector+=newWord+array[1]+array[2];
	jquerrySelector+=newWord+array[1]+array[3];
	if(jquerrySelector=="")
		jquerrySelector="*";
	//set jqueryConversion is later used in delUnusedSelector function.
	jquerryConversion[newSelector]=jquerrySelector;
	if(newSelector!=logSelector){
		logFile+=("Selector '"+logSelector+"' was changed to '"+newSelector+"'.\n\n");
	}
	return newSelector;
}




//check simple selector structure
function checkSelectorStructure(word,obj,classes,distance,list){
	word=word.trim();
	var array=new Array();
	var specialSelector="";
	var basicSelector=word;
	var classOrId="";
	//check for pseudo classes and elements
	var div=/(::|:)/;
	match=div.exec(basicSelector);
	if(match!=null){
		specialSelector=basicSelector.substring(match.index);
		basicSelector=basicSelector.substring(0,match.index);
	}
	//check if selector is a class or identifier
	var div=/(\.|#)/;
	match=div.exec(basicSelector);
	if(match!=null){
		classOrId=basicSelector.substring(match.index);
		//check if selector is a combination of more then one class, break selector into single classes and save classes in set 'classes' which is used in getclasses function
		var multiple=classOrId.split(".");
		if(multiple.length>1){
			for(i in multiple){
				if(multiple[i].indexOf("#")==-1){
					classes.add(multiple[i]);
				}
				else
					classes.add(multiple[i].substring(0,multiple[i].indexOf("#")));
			}
		}
		else if(match[0]==".")
			classes.add(multiple[0]);
		basicSelector=basicSelector.substring(0,match.index);
	}
	var newSpecialSelector="";
	var jquerySpecialSelector="";
	//check if pseudo classes and elements are legit
	if(specialSelector!=""){
		var div1=/:+/g;
		var a=0;
		var singleSpecialSelector="";
		var isJqueryCompatible=true;
		//check if there are more then one pseudo classes and elements in a 'special selector' string
		while((match1=div1.exec(specialSelector))!==null){
			//break combined pseudo classes and elements into parts
			singleSpecialSelector=specialSelector.substring(a,match1.index);
			if(singleSpecialSelector.length>0 && !under.str.startsWith(singleSpecialSelector,":-webkit") && !under.str.startsWith(singleSpecialSelector,":-moz")){
				//check for brackets and remove content inside brackets for easier comparison
				var div=/\(([^\)]*)\)+/;
				var insideBrackets="";
				match=div.exec(singleSpecialSelector);
				if(match!=null){
					insideBrackets=match[1];
					singleSpecialSelector=singleSpecialSelector.substring(0,match.index+1)+singleSpecialSelector.substring(match.index+match[0].length-1);
				}
				//check if pseudo element or class is legit, if not, replace it with a most similar legit element 
				var closest=distance;
				var closestWord=singleSpecialSelector;
				if(distance>0){
					for (var i = 0; i < obj.length; i++) {
						var distancedl=DamerauLevenshteinDistance(singleSpecialSelector.toLowerCase(), obj[i]);
						if(distancedl<closest){
							closest=distancedl;
							closestWord=obj[i];
						}
					}
				}
				if(list.indexOf(closestWord)!=-1){
					isJqueryCompatible=false;
				}
				//restore content inside brackets
				if(insideBrackets==""){
					singleSpecialSelector=closestWord;
				}	
				else{
					var div=/\(/;
					match=div.exec(closestWord);
					if(match!=null)
						singleSpecialSelector=closestWord.substring(0, match.index+1)+insideBrackets+closestWord.substring(match.index+1);
					else
						singleSpecialSelector=closestWord;
				}

			}
			a=match1.index;
			newSpecialSelector+=singleSpecialSelector;
			if(isJqueryCompatible)
				jquerySpecialSelector+=singleSpecialSelector;
			isJqueryCompatible=true;

		}
		//check for the part of the selector behind the last divider : or :: and do the same as in the upper while loop
		singleSpecialSelector=specialSelector.substring(a);
		if(singleSpecialSelector.length>0 && !under.str.startsWith(singleSpecialSelector,":-webkit") && !under.str.startsWith(singleSpecialSelector,":-moz") ){
			var div=/\(([^\)]*)\)+/;
			var insideBrackets="";
			match=div.exec(singleSpecialSelector);
			if(match!=null){
				insideBrackets=match[1];
				singleSpecialSelector=singleSpecialSelector.substring(0,match.index+1)+singleSpecialSelector.substring(match.index+match[0].length-1);
			}
			var closest=distance;
			var closestWord=singleSpecialSelector;
			if(distance>0){
				for (var i = 0; i < obj.length; i++) {
					var distancedl=DamerauLevenshteinDistance(singleSpecialSelector.toLowerCase(), obj[i]);
					if(distancedl<closest){
						closest=distancedl;
						closestWord=obj[i];
					}
				}
			}
			if(list.indexOf(closestWord)!=-1){
				isJqueryCompatible=false;
			}
			if(insideBrackets==""){
				singleSpecialSelector=closestWord;
					
			}	
			else{
				var div=/\(/;
				match=div.exec(closestWord);
				if(match!=null)
					singleSpecialSelector=closestWord.substring(0, match.index+1)+insideBrackets+closestWord.substring(match.index+1);
				else
					singleSpecialSelector=closestWord;
			}
		}
		newSpecialSelector+=singleSpecialSelector;
		if(isJqueryCompatible)
			jquerySpecialSelector+=singleSpecialSelector;

	}
	return [basicSelector,classOrId,newSpecialSelector, jquerySpecialSelector];	
}

//check if selector attributes are legit
function checkSelectorAtributes(word,attr,obj,classes,distance){
	//check dividers
	attr=attr.replace(/=+/g, "=");
	attr=attr.replace(/~+/g, "~");
	attr=attr.substring(1,attr.length-1);
	var dividers=/[\|~$*^]?= *[^\]]*/g;
	//check if attribute stands by itself or is connected to some selector: for instance a[src] is connected, [src] is not 
	if(word.length==0 || word=="*" || word.charAt(0)=="." || word.charAt(0)=="#"){
		var array=Object.keys(obj);
		var word="";
		var newAtribute="[";
		var div="";
		if((match=dividers.exec(attr))!==null){
			var div=match[0];
			var word=attr.substring(0,match.index);
		}	
		else{
			var word=attr;
		}
		//check if atribute is legit, if not, replace it with a most similar legit attribute
		var closestWord=word;
		if(word!="" && distance>0){
			if(!under.str.startsWith(word,"data-")){
				var closest=distance;
				for (var i = 0; i < array.length; i++) {
					if(obj[array[i]].length>0){
						var attributes=obj[array[i]];
						for (var j = 0; j < attributes.length; j++) {
							
							var distancedl=DamerauLevenshteinDistance(word.toLowerCase(), attributes[j]);
							if(distancedl<closest){
								closest=distancedl;
								closestWord=attributes[j];
							}

						}
						
					}
							
				}
				
			}
			else
				closestWord=word;
		}
		//find classes and put them in a classes set whick is used in get classes method
		if(closestWord=="class"){
			var c=div.substring(div.indexOf("=")+1);
			if(c[0]=="'" || c[0]=='"')
				c=c.substring(1,c.length-1);
			classes.add(c);
		}	
		newAtribute+=closestWord+div+"]";
	}
	//do the same for atrributes that are connected to type selectors		
	else{
		var attributeSelector="";
		var newAtribute="[";
		var div="";
		if((match=dividers.exec(attr))!==null){
			var div=match[0];
			attributeSelector=attr.substring(0,match.index);
		}
		else{
			var attributeSelector=attr;
		}
		var closestWord=attributeSelector;
		if(word!="" && distance>0){
			var attributes;
			//check if connected attribute is legit and if connected type selector has this attribute 
			if(obj[word.trim()]!=undefined)
				attributes=obj[word.trim()].concat(obj['*']);
			else
				attributes=obj['*'];
			var closest=distance;
			if(!under.str.startsWith(attributeSelector,"data-")){
				for (var j = 0; j < attributes.length; j++) {
					var distancedl=DamerauLevenshteinDistance(attributeSelector.toLowerCase(), attributes[j]);
					
					if(distancedl<closest){
						closest=distancedl;
						closestWord=attributes[j];
					}
				}
				
			}	
			else
				closestWord=attributeSelector;
		}
		if(closestWord=="class"){
			var c=div.substring(div.indexOf("=")+1);
			if(c[0]=="'" || c[0]=='"')
				c=c.substring(1,c.length-1);
			classes.add(c);
		}
		newAtribute+=closestWord+div+"]";
	}
	return newAtribute;
}	
	

//check if type selector is legit and if not, replace it with the most similar type selector
function checkSelectorParts(word,obj,distance){
	if ( obj.hasOwnProperty(word) ) {
    	return word;
	}
	var array=Object.keys(obj);
	var closest=distance;
	var closestWord=word;
	for (var i = 0; i < array.length; i++) {
		var distancedl=DamerauLevenshteinDistance(word.toLowerCase(), array[i])
		if(distancedl<closest){
			closest=distancedl;
			closestWord=array[i];
		}
	};
	return closestWord;
}

//find duplicated selectors
function findDuplicate(sheet){
	Map = require("collection").Map;
	var map=new Map();
	var mapm=new Map();
	var mapd=new Map();
	var maps=new Map();
	var duplicates=new Array();
	var duplicatesm=new Array();
	var duplicatesd=new Array();
	var duplicatess=new Array();
	//check for unnested duplicated selectors
	for(i in sheet.rules){
	    var selectors=sheet.rules[i].selectors;
	    if(selectors!=undefined && selectors[0].charAt(0)!='@'){
			var selector;
			if(selectors.length>1)
				selector=selectors.join(",");
			else
				selector=selectors[0];
			//if selector has a duplicate, push it to array, find its duplicate in a map and combine their properties
			if(map.has(selector)){
				duplicates.push(i);
				logFile+=("Selector '"+selector+"' was duplicated.\n\n");
				var old=sheet.rules[map.get(selector)].declarations;
				var newDec=	sheet.rules[i].declarations;
				for(i in newDec){
				    var propertyNew=newDec[i].property;
					var isInside=false;
					for(j in old){
					    var propertyOld=old[j].property;
						if(propertyOld==propertyNew){
						    if(old[i]!=undefined && newDec[j]!=undefined){
						    	old[i].value=newDec[j].value;
								isInside=true;
								break;
							}	
						}
					}
					if(!isInside){
					    old.push(newDec[i]);
					}
				}
			}
			else{
				map.set(selector,i);
			}
		}
		//check for nested duplicated selectors
		else if(sheet.rules[i].type=='media'){
			for(j in sheet.rules[i].rules){
				var selectors=sheet.rules[i].rules[j].selectors;
				if(selectors!=undefined && selectors[0].charAt(0)!='@'){
					var selector;
					if(selectors.length>1)
						selector=selectors.join(",");
					else
						selector=selectors[0];
					duplicatesNested(selector, i, j, sheet, mapm, duplicatesm)
					
				}
			}
			//delete duplicated selectors
			for(j=duplicatesm.length-1; j>=0; j--){
				(sheet.rules[i].rules).splice(duplicatesm[j],1);
			}
			
		}
		else if(sheet.rules[i].type=='document'){
			for(j in sheet.rules[i].rules){
				var selectors=sheet.rules[i].rules[j].selectors;
				if(selectors!=undefined && selectors[0].charAt(0)!='@'){
					var selector;
					if(selectors.length>1)
						selector=selectors.join(",");
					else
						selector=selectors[0];
					duplicatesNested(selector, i, j, sheet, mapd, duplicatesd)
					
				}
			}
			for(j=duplicatesd.length-1; j>=0; j--){
				(sheet.rules[i].rules).splice(duplicatesd[j],1);
			}
			
		}
		else if(sheet.rules[i].type=='supports'){
			for(j in sheet.rules[i].rules){
				var selectors=sheet.rules[i].rules[j].selectors;
				if(selectors!=undefined && selectors[0].charAt(0)!='@'){
					var selector;
					if(selectors.length>1)
						selector=selectors.join(",");
					else
						selector=selectors[0];
					duplicatesNested(selector, i, j, sheet, maps, duplicatess)
					
				}
			}
			for(j=duplicatess.length-1; j>=0; j--){
				(sheet.rules[i].rules).splice(duplicatess[j],1);
			}
			
		}			
	}
	//delete unnested duplicates
	for(var i=duplicates.length-1;i>=0;i--){
		(sheet.rules).splice(duplicates[i],1);
	}
	logFile+="\n\n";
}

//function for finding and combining nested duplicated selectors. The procedure is the same as for unnested selectors.
function duplicatesNested(selector,i,j,sheet,map,duplicates){
	if(map.has(selector)){
		duplicates.push(j);
		logFile+=("Selector '"+selector+"' was duplicated.\n\n");
		var old=sheet.rules[i].rules[map.get(selector)].declarations;
		var newDec=	sheet.rules[i].rules[j].declarations;
		for(d in newDec){
			var propertyNew=newDec[d].property;
			var isInside=false;
			for(d1 in old){
				var propertyOld=old[d1].property;
				if(propertyOld==propertyNew){
					if(old[d]!=undefined && newDec[d1]!=undefined){
						old[d].value=newDec[d1].value;
						isInside=true;
						break;
					}	
				}
			}
			if(!isInside){
				old.push(newDec[d]);
			}
		}
		
	}
	else{
		map.set(selector,j);
	}
}

//function for calculating Damerau Levensthein distance between words.
function DamerauLevenshteinDistance(s, t) {
    var d = []; //2d matrix
	var n = s.length;
    var m = t.length;
	if (n == 0) return m;
    if (m == 0) return n;

    //Create an array of arrays
    for (var i = n; i >= 0; i--) d[i] = [];
	for (var i = n; i >= 0; i--) d[i][0] = i;
    for (var j = m; j >= 0; j--) d[0][j] = j;
	for (var i = 1; i <= n; i++) {
        var s_i = s.charAt(i - 1);
		for (var j = 1; j <= m; j++) {

            //Check the jagged ld total so far
            if (i == j && d[i][j] > 4) return n;

            var t_j = t.charAt(j - 1);
            var cost = (s_i == t_j) ? 0 : 1; 

            //Calculate the minimum
            var mi = d[i - 1][j] + 1;
            var b = d[i][j - 1] + 1;
            var c = d[i - 1][j - 1] + cost;

            if (b < mi) mi = b;
            if (c < mi) mi = c;

            d[i][j] = mi; 

            //Damerau transposition
            if (i > 1 && j > 1 && s_i == t.charAt(j - 2) && s.charAt(i - 2) == t_j) {
                d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + cost);
            }
        }
    }
	return d[n][m];
}

//an object with all html tags and their attributes
var el={}
    el["html"]=["manifest"];
    el["head"]=["profile"];
    el["title"]=[];
    el["base"]=['href','target'];
    el["link"]=['charset','crossorigin','disabled','href','hreflang','media','methods','rel','rev','sizes','target','type'];
    el["meta"]=['charset','content','http-equiv','name','scheme'];
    el["style"]=['type','media','scoped','title','disabled'];
    el["script"]=['async','src','type','language','defer','crossorigin'];
    el["noscript"]=[];
    el["body"]=['alink','background','bgcolor','link','onafterprint','onbeforeprint','onbeforeunload','onblur','onerror','onfocus','onhashchange','onload','onmessage','onoffline','ononline','onpopstate','onredo','onresize','onstorage','onundo','onunload','text','vlink'];
    el["section"]=[];
    el["nav"]=[];
    el["article"]=[];
    el["aside"]=[];
    el["h1"]=['align'];
    el["h2"]=['align'];
    el["h3"]=['align'];
    el["h4"]=['align'];
    el["h5"]=['align'];
    el["h6"]=['align'];
    el["header"]=[];
    el["footer"]=[];
    el["address"]=[];
    el["main"]=[];
    el["p"]=['align'];
    el["hr"]=['align','color','noshade','size','width'];
    el['pre'] = [];
	el['blockquote'] = ['cite'];
	el['ol'] = ['compact','reversed','start','type'];
	el['ul'] = ['compact','type'];
	el['li'] = ['value','type'];
	el['dl'] = ['compact'];
	el['dt'] = [];
	el['dd'] = ['nowrap'];
	el['figure'] = [];
	el['figcaption'] = [];
	el['div'] = ['align'];
	el['a'] = ['charset','coords','datafld','datasrc','download','href','hreflang','media','methods','name','ping','rel','rev','shape','target','type','urn'];
	el['em'] = [];
	el['strong'] = [];
	el['small'] = [];
	el['s'] = [];
	el['cite'] = [];
	el['q'] = ['cite'];
	el['dfn'] = [];
	el['abbr'] = [];
	el['data'] = ['value'];
	el['time'] = ['datetime'];
	el['code'] = [];
	el['var'] = [];
	el['samp'] = [];
	el['kbd'] = [];
	el['sub'] = [];
	el['sup'] = [];
	el['i'] = [];
	el['b'] = [];
	el['u'] = [];
	el['mark'] = [];
	el['ruby'] = [];
	el['rt'] = [];
	el['rp'] = [];
	el['bdi'] = [];
	el['bdo'] = [];
	el['span'] = [];
	el['br'] = ['clear'];
	el['wbr'] = [];
	el['ins'] = ['cite','datetime'];
	el['del'] = ['cite','datetime'];
	el['img'] = ['align','alt','border','crossorigin','height','hspace','ismap','longdesc','name','src','width','usemap','vspace'];
	el['iframe'] = ['align','allowfullscreen','frameborder','height','longdesc','marginheight','marginwidth','mozallowfullscreen','webkitallowfullscreen','mozapp','mozbrowser','name','remote','scrolling','sandbox','seamless','src','srcdoc','width'];
	el['embed'] = ['height','src','type','width'];
	el['object'] = ['archive','border','classid','codebase','codetype','data','declare','form','height','name','standby','tabindex','type','usemap','width'];
	el['param'] = ['name','type','value','valuetype'];
	el['video'] = ['autoplay','autobuffer','buffered','controls','crossorigin','height','loop','muted','played','preload','poster','src','width'];
	el['audio'] = ['autoplay','autobuffer','buffered','controls','loop','mozCurrentSampleOffset','muted','played','preload','src','volume'];
	el['source'] = ['src','type','media'];
	el['track'] = ['default','kind','label','src','srclang'];
	el['canvas'] = ['width','height'];
	el['map'] = [];
	el['area'] = ['accesskey','alt','coords','download','href','hreflang','name','media','nohref','rel','shape','tabindex','target','type'];
	el['svg'] = ['version','baseProfile','x','y','width','height','preserveAspectRatio','contentScriptType','contentStyleType','viewBox','zoomAndPan'];
	el['math'] = ['dir','decimalpoint','displaystyle','infixlinebreakstyle', 'scriptlevel', 'scriptminsize', 'scriptsizemultiplier','href','mathbackground','mathcolor','display','mode','overflow'];
	el['table'] = ['align','bgcolor','border','cellpadding','cellspacing','frame','rules','summary','width'];
	el['caption'] = ['align'];
	el['colgroup'] = ['align','bgcolor','char','charoff','span','valign','width'];
	el['col'] = ['align','bgcolor','char','charoff','span','valign','width'];
	el['tbody'] = ['align','bgcolor','char','charoff','valign'];
	el['thead'] = ['align','bgcolor','char','charoff','valign'];
	el['tfoot'] = ['align','bgcolor','char','charoff','valign'];
	el['tr'] = ['align','bgcolor','char','charoff','valign'];
	el['td'] = ['abbr','align','axis','bgcolor','char','charoff','colspan','headers','rowspan','scope','valign'];
	el['th'] = ['abbr','align','axis','bgcolor','char','charoff','colspan','headers','rowspan','scope','valign'];
	el['form'] = ['accept','accept-charset','action','autocomplete','enctype','method','name','novalidate','target'];
	el['fieldset'] = ['disabled','form','name'];
	el['legend'] = [];
	el['label'] = ['accesskey','for','form'];
	el['input'] = ['type','accept','accesskey','mozactionhint','autocomplete','autofocus','autosave','checked','disabled','form','formaction','formenctype','formmethod','formnovalidate','formtarget','height','inputmode','list','max','maxlength','min','multiple','name','pattern','placeholder','readonly','required','selectionDirection','size','spellcheck','src','step','tabindex','usemap','value','width','x-moz-errormessage'];
	el['button'] = ['autofocus','disabled','form','formaction','formenctype','formmethod','formnovalidate','formtarget','name','type','value'];
	el['select'] = ['autofocus','disabled','form','multiple','name','required','size'];
	el['datalist'] = [];
	el['optgroup'] = ['disabled','label'];
	el['option'] = ['disabled','label','selected','value'];
	el['textarea'] = ['autofocus','cols','disabled','form','maxlength','name','placeholder','readonly','required','rows','selectionDirection','selectionEnd','selectionStart','spellcheck','wrap'];
	el['keygen'] = ['autofocus','challenge','disabled','form','keytype','name'];
	el['output'] = ['for','form','name'];
	el['progress'] = ['max','value','orient'];
	el['meter'] = ['value','min','max','low','high','optimum','form'];
	el['details'] = ['open'];
	el['summary'] = [];
	el['menuitem'] = ['checked','command','default','disabled','icon','label','radiogroup','type'];
	el['menu'] = ['type','label','context','toolbar','list'];
	el['mstyle']=['dir','decimalpoint','displaystyle','infixlinebreakstyle', 'scriptlevel', 'scriptminsize', 'scriptsizemultiplier'];
    el['mrow']=[];
	el['msup']=[];
	el['mo']=[];
	el['mi']=[];
	el['mn']=[];
	el['mcol']=[];
    el['*']=['accesskey','class','contenteditable', 'contextmenu','dir','draggable','dropzone','hidden','id','itemid','itemprop','itemref','itemscope','itemtype','lang','spellcheck','style','tabindex','title'];

//array containing all pseudo classes and elements
var special=new Array(':active', '::after', ':after','::before',':before',':checked', '::choices',':default', ':dir()', ':disabled',
	                   ':empty', ':enabled',':first', ':first-child', '::first-letter', ':first-letter', '::first-line', ':first-line',':first-of-type', ':focus',':fullscreen',':hover',':indeterminate', ':in-range',
	                   ':invalid',':lang()', ':last-child', ':last-of-type', ':left',':link',':not()', ':nth-child()', ':nth-last-child()', ':nth-last-of-type()',
	                   ':nth-of-type()',':only-child', ':only-of-type', ':optional', ':out-of-range',':read-only', ':read-write','::repeat-index', '::repeat-item',
	                   ':required',':right', ':root',':scope', '::selection',':target',':valid', '::value',':visited');

//array containing pseudo classes and elements not supported by jquery
var jquerryList=new Array(':active','::after', ':after',':before','::before','::choices',':default',':dir()','::first-letter', 
					  ':first-letter', '::first-line', ':first-line',':fullscreen',':hover',':indeterminate',':out-of-range',':in-range',':invalid',
					  ':left',':right',':link',':optional',':read-only',':read-write','::repeat-index','::repeat-item',':required',':scope','::selection',
					  ':valid','::value',':visited');