'use strict';

const fs = require('fs');
const papa = require('papaparse');
const PDF = require('pdfkit');

const memberPBsFile = 'LASC_SWIMTIMES.csv'
const eventsJSONFile = 'eventList.json'
const competitorsListFile = 'competitors.csv'
const LANECOUNT = 5
const HEATSPERPAGE = 4;
const SWIMMERSPERPAGE = 4;
const StartListsPDF = 'startlists.pdf'
const LaneListsPDF = 'lanelists.pdf'

console.log("Initiating Start Lists script");

//
//Importing Stages
//
console.log("\nImporting Swimmer PB Times across all strokes");
var readCSV = fs.readFileSync(memberPBsFile, 'utf-8');
const memberPBsJSON = papa.parse(readCSV, { header: true});
console.log("Imported and parsed");

console.log("\nImporting required events list to generate start sheets for")
const eventsJSON = JSON.parse(fs.readFileSync(eventsJSONFile, 'utf-8'));
console.log("Imported and parsed");

console.log("\nImporting list of swimmers competing")
readCSV = fs.readFileSync(competitorsListFile, 'utf-8');
const competitorsJSON = papa.parse(readCSV, { header: true});
console.log("Imported and parsed");

//
// Main processing loops
//
var StartLists = [];
eventsJSON.events.forEach(event => {
    console.log("Creating start sheets for", event.stroke, event.distance)
    const unorderedSwimmers = getSwimmerPBs(event);
    const orderedSwimmers = orderByTime(unorderedSwimmers)
    const swimHeats = generateHeats(orderedSwimmers)
    StartLists["" + event.distance + " " + event.stroke] = { "Heats": swimHeats}
});

produceStartLists(StartLists);  
produceLaneLists(StartLists);

//
// Functions
//
function findPB(swimmerName, eventStroke, eventDistance) {
    const swimmerTimes = memberPBsJSON.data.filter(swimTime => {
        if(
            (swimTime.Name == swimmerName)
         && (swimTime.Stroke == eventStroke)
         && (swimTime.Distance == eventDistance)
        )
            return true;
        else
            return false;
    })
    if(swimmerTimes.length == 1) return swimmerTimes[0];
    const swimmerTime25mPool = swimmerTimes.filter(swimTime => {
        return swimTime.Pool == "25m"
    })
    return swimmerTime25mPool[0];
}

function getSwimmerPBs(event) {
    console.log("Getting swimmer PBs");
    var swimmerName;
    var pbTime;
    var participants = [];
    competitorsJSON.data.forEach(swimmer => {       
        swimmerName = swimmer.Surname + ", " + swimmer.Firstname
        pbTime = findPB(swimmerName, event.stroke, event.distance);
        participants.push({
            Name: swimmerName,
            Time: pbTime ? pbTime.Time : ''
        })
    })
    return participants;
}

function orderByTime(unorderedSwimmers) {
    return unorderedSwimmers.sort((a, b) => { 
        if(a.Time == '') return 1;
        if(b.Time == '') return -1;
        if (a.Time < b.Time) return -1;
        if (a.Time > b.Time) return 1;
        return 0;
    });
}

function generateHeats(swimmers) {
    var eventHeats = [];
    const heatTotal = Math.ceil(swimmers.length / LANECOUNT);
    console.log("Num of Heats:", heatTotal)
    var nextHeat;
    for(var heat=heatTotal; heat > 0; heat--) {
        nextHeat = getNextHeat(heat, swimmers);
        if(swimmers.length == 1) {
            swimmers.unshift(nextHeat["Lane 5"]);
            nextHeat["Lane 5"] = "";
        }
        eventHeats.unshift(nextHeat);
    }
    return eventHeats;    
}

function getNextHeat(heatCount, swimmers) {
    var nextHeat = {};
    nextHeat["Lane 3"] = swimmers.shift();
    nextHeat["Lane 2"] = swimmers.shift();
    nextHeat["Lane 4"] = swimmers.shift();
    nextHeat["Lane 1"] = swimmers.shift();
    nextHeat["Lane 5"] = swimmers.shift();

    return { 
        "Lane 1": nextHeat["Lane 1"] ? nextHeat["Lane 1"] : {Name: "", Time: ""},
        "Lane 2": nextHeat["Lane 2"] ? nextHeat["Lane 2"] : {Name: "", Time: ""},
        "Lane 3": nextHeat["Lane 3"] ? nextHeat["Lane 3"] : {Name: "", Time: ""},
        "Lane 4": nextHeat["Lane 4"] ? nextHeat["Lane 4"] : {Name: "", Time: ""},
        "Lane 5": nextHeat["Lane 5"] ? nextHeat["Lane 5"] : {Name: "", Time: ""}
    }
}

function produceStartLists(startLists) {
    const pdf = new PDF({size: 'A4'});
    pdf.pipe(fs.createWriteStream(StartListsPDF));

    const events = Object.keys(startLists);

    var heatsOnPageCount;
    events.forEach((event, idx) => {
        heatsOnPageCount = 1;
        if(idx > 0) pdf.addPage();
        pdf
        .font('Helvetica-Bold')
        .text("EVENT: " + event, { underline: true})
        .moveDown()
        startLists[event].Heats.forEach((heat, heatIdx) => {
            if(heatsOnPageCount > HEATSPERPAGE) {
                heatsOnPageCount = 1;
                pdf.addPage();
                pdf
                .font('Helvetica-Bold')
                .text("EVENT: " + event, { underline: true})
                .moveDown()
            }
            pdf
            .font('Helvetica-Bold')
            .text("Heat " + (heatIdx+1) + ":", 100)
            .moveDown(0.5);

            var firstName, surName, fullName;
            Object.keys(heat).forEach(lane => {
                firstName = heat[lane].Name.split(',')[1];
                surName = heat[lane].Name.split(',')[0];
                fullName = heat[lane].Name ? firstName + " " + surName : ""
                pdf
                .font('Helvetica')
                .text(lane + ":  " + fullName, 120)    
                .moveDown(0.5);
            })

            pdf.moveDown(2);

            heatsOnPageCount++;
        })

    })

    pdf.end();
}

function produceLaneLists(startLists) {

    const Y_COORD_STARTER = 100;
    const Y_COORD_LINESPACER = 25;

    const events = Object.keys(startLists);

    var laneData = {};

    var heatNumber = 0;
    events.forEach((event, idx) => {
        heatNumber=1;
        startLists[event].Heats.forEach((heat, heatIdx) => {
            var firstName, surName, fullName;
            Object.keys(heat).forEach(lane => {

                firstName = heat[lane].Name.split(',')[1];
                surName = heat[lane].Name.split(',')[0];
                fullName = heat[lane].Name ? firstName + " " + surName : ""
                laneData[lane] ? 
                    laneData[lane].push({Event: event, Heat: heatNumber, Name: fullName, Time: heat[lane].Time})
                  : laneData[lane]=[{Event: event, Heat: heatNumber, Name: fullName, Time: heat[lane].Time}]

            })
            heatNumber++;
        })
    })

    const pdf = new PDF({size: 'A4'});
    pdf.pipe(fs.createWriteStream(LaneListsPDF));

    const lanes = Object.keys(laneData);

    var swimmersOnPageCount;
    var y_coord = Y_COORD_STARTER;
    lanes.forEach((lane, idx) => {
        y_coord = Y_COORD_STARTER;
        swimmersOnPageCount = 1;
        if(idx > 0) pdf.addPage();
        pdf
        .font('Helvetica-Bold')
        .text(lane, { underline: true})
        laneData[lane].forEach(swimmer => {
            if(swimmersOnPageCount > SWIMMERSPERPAGE) {
                swimmersOnPageCount = 1;
                y_coord = Y_COORD_STARTER;
                pdf.addPage();
                pdf
                .font('Helvetica-Bold')
                .text(lane, { underline: true})
            }           
            pdf
            .font('Helvetica')
            .text("Event : " + swimmer.Event + ",      Heat : " + swimmer.Heat, 100, y_coord)
            y_coord+=Y_COORD_LINESPACER   
            pdf
            .font('Helvetica')
            .text("Name : " + swimmer.Name + ",     PB : " + swimmer.Time, 100, y_coord)   
            y_coord+=Y_COORD_LINESPACER*2
            pdf
            .font('Helvetica-Bold')
            .text("Time : ", 100, y_coord)
            pdf.moveTo(150, y_coord+10)
            .lineTo(400, y_coord+10)
            .stroke()
            y_coord+=Y_COORD_LINESPACER*3

            swimmersOnPageCount++;
        })
    })

    pdf.end();
}