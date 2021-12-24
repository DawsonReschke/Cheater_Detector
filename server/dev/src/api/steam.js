const express = require('express');
require('dotenv').config();
const XMLHttpRequest  = require('xhr2')
const { MongoClient,ObjectId } = require('mongodb');
let payload = {};
const router = express.Router();
const key = process.env.KEY; 

router.post('/', async (req, res,next) => {
    try{
        const {body} = req; 
        const {message} = body; 
        let steam64IDs=[]; 
        const steamIDs = parseSteamIDs(message); 
             steam64IDs = steamIDs.map(id =>{
                return String(steamIDtosteam64(id)); 
            })
        await handleSteamAPICalls(steam64IDs); 
        await Insert_All_Steam_Users_From_Payload(payload);
        res.json(payload); 
    }catch(error){
        next(error); 
    }
});
router.get('/', async(req,res,next)=>{
    try {
        const {body} = req; 
        res.json(body); 
    } catch (error) {
        next(error); 
    }
})
router.delete('/',async(req,res,next)=>{
    try{
        const {auth} = req.query; 
        if(auth == process.env.AUTH_TOKEN){
            await Get_All_Ids_From_Database(Update_All_Users);
            res.json({"message":"success"}); 
        }else{
            res.json({"message":"access denied"})
        }
    }catch(error){
        next(error); 
    }
})

// responseFormat : example: {something that you want to parse:{}}
//response:{players:[]}; 
// in order to use this code we need to stuff it into a promise...
function createRequest(url){
    return new Promise(function(resolve,reject){
        const xhr = new XMLHttpRequest(); 
        xhr.open("GET",url); 
        xhr.send(); 
        xhr.onload = function(){
            if(xhr.status == 200){
                let data = JSON.parse(xhr.responseText); 
                resolve(data); 
            }else{
                resolve({status: xhr.status,errorMessage:xhr.statusMessage}); 
            }
        }
        xhr.onerror = function(){
            console.log('an error has occured');
            resolve({status:0,statusMessage:'network error'}); 
        }
    })
}

async function Query_Database(params,findOne,callBack,projection){
    const client = await MongoClient.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
    await client.connect(async (err) => {
        const collection = client.db("cheaterDB").collection("players");  
        const entries = []
        findOne ? entries.push(await collection.findOne(params)).project(projection) : await collection.find(params).project(projection).forEach((val)=>{entries.push(val._id)})
        callBack(findOne ? entries[0] :entries);      
        client.close();
      });
}

async function Query_DB_By_SteamId(steamid,callBack){
    await Query_Database({_id:steamid},true,callBack)
}

async function Insert_All_Steam_Users_From_Payload(payload){
    let keys = Object.keys(payload);
    let playerArrayForInsertion = []
    keys.forEach((key)=>{
        playerArrayForInsertion.push({_id : key, 'Steam_Data': payload[key]})
    })
    const client = await MongoClient.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
    await client.connect(async (err) => {
        const collection = client.db("cheaterDB").collection("players");
        for(let i = 0; i < playerArrayForInsertion.length;i++){
            const currentObject = playerArrayForInsertion[i]
            const inserted = await collection.updateOne({_id:playerArrayForInsertion[i]._id},{$set:currentObject},{upsert:true}); 
        }
        client.close();
      }); 
}

async function Delete_All_entries_From_Database(){
    const client = await MongoClient.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
    await client.connect(async (err) => {
        const collection = client.db("cheaterDB").collection("players");
        const deleted = await collection.deleteMany({}); 
        client.close();
      }); 
}


async function Get_Vac_Banned_Players_Steamids(callBack){
    await(Query_Database({"Steam_Data.user_vac_ban":false},false,callBack,{"Steam_Data":0}))
}

async function Get_All_Ids_From_Database(callBack){
    await Query_Database({},false,callBack,{"Steam_Data":0})
}

async function Update_All_Users(steamids){
    const numOfArrays = Math.ceil(steamids.length/100)
    console.log(numOfArrays); 
    for(let i = 0; i < numOfArrays; i++){
        const steamIdsToHundred = steamids.splice(i*100,(i+1) * 100)
        await handleSteamAPICalls(steamIdsToHundred)
        await Insert_All_Steam_Users_From_Payload(payload); 
    }
}

async function handleSteamAPICalls(steamids){
    initializePayload(steamids); 
    await getUsersStatsFromGame(steamids);
    await getUsersData(steamids); 
    await getUsersSteamLevel(steamids); 
    await getUsersHoursPlayed(steamids); 
    await getUsersBanRecord(steamids)
    console.log('done executing steam api calls'); 
    // this method calls each api in order each after the last has completed...
}

function initializePayload(steamids){
    payload = {}
    steamids.forEach((val)=>{
        payload[val] = {
            'owned_game_data' : {},
            'user_data' : {},
            'steam_level': 0,
            'user_vac_ban':{},
            'user_ban_record':{},
            'user_game_stats':{},
        }; 
    })
}

async function getUsersStatsFromGame(steamids){
    for(let i = 0; i < steamids.length; i++){
            payload[steamids[i]]['user_game_stats'] = await getUserStatsFromGame(steamids[i]); 
    }
}

async function getUsersHoursPlayed(steamids){
    for(let i = 0; i < steamids.length; i++){
        if(!payload[steamids[i]]){payload[steamids[i]]={}}
        payload[steamids[i]]['owned_game_data'] = await getUserHoursPlayed(steamids[i]); 
    }
}

async function getUsersBanRecord(steamids){
    let arr = await getUserBanRecord(steamids); 
    arr.forEach((val)=>{
        let ID = val['SteamId']
        delete val['SteamId']
        let isVacBanned = val.VACBanned;
        delete val.VACBanned; 
        payload[ID]['user_vac_ban'] = isVacBanned; 
        payload[ID]['user_ban_record'] = val; 
    })
}

async function getUsersData (steamids){
    const URL = `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${key}&&steamids=${steamids}`
    const steamUsersData = await createRequest(URL); 
    parseUserData(steamUsersData,payload); 
}

async function getUsersSteamLevel(steamids){
    for(let i = 0; i < steamids.length; i++){
        if(!payload[steamids[i]]){payload[steamids[i]]={}}
        payload[steamids[i]]['steam_level'] = {}
        payload[steamids[i]]['steam_level'] = await getUserSteamLevel(steamids[i])
    }
}

function parseUserData(response){
    const keysToRemove = ['lastlogoff','commentpermission','avatarmedium','avatarfull','avatarhash','personastate','realname','primaryclanid','personastateflags','loccountrycode','locstatecode','loccityid']
    const SteamResponsePlayerArray = response['response']['players']; 
    SteamResponsePlayerArray.forEach((userSummaryData)=>{
        for(let i = 0; i< keysToRemove.length; i++){
            delete userSummaryData[keysToRemove[i]]
        }
        let userSteamID = userSummaryData['steamid']; 
        delete userSummaryData['steamid']
        if(!payload[String(userSteamID)]){
            payload[String(userSteamID)] = {};
        }
        payload[String(userSteamID)]['user_data'] = userSummaryData; 
    })
}

async function getUserStatsFromGame(steamid){
    const URL = 'https://api.steampowered.com/ISteamUserStats/GetUserStatsForGame/v2/'
    const appID = '000730'
    const steamUserStatsFromGameResponse = await createRequest(`${URL}/?key=${key}&steamid=${(steamid)}&appid=${appID}`)
    const parsedJSON = parseUserStatsFromGame(steamUserStatsFromGameResponse); 
    return parsedJSON; 
}

function parseUserStatsFromGame(userStatsFromGame){
    const keys = (Object.keys(userStatsFromGame))
    if(keys.includes('status')){
        return; 
    }
    const steamid = parseSteamidFromUserStats(userStatsFromGame); 
    const achievmentCount = parseAchievments(userStatsFromGame);
    const lastMatchData = parseLastMatch(userStatsFromGame); 
    const generalMatchData = parseGeneralMatchData(userStatsFromGame); 
    const parsedUserStats = {
        'achievment_count': achievmentCount,
        'last_match_data': lastMatchData,
        'general_stats': generalMatchData,
    }
    return parsedUserStats; 
}

function parseAchievments(ach){
    const achievmentCount = Object.keys(ach['playerstats']['achievements']).length;
    return achievmentCount; 
}

function parseSteamidFromUserStats(userStatsFromGame){
    return userStatsFromGame['playerstats']['steamID'];
}

function parseLastMatch(userStatsFromGame){
    const lastMatchData = {}; 
    Object.keys(userStatsFromGame['playerstats']['stats']).forEach((userStat)=>{
        if(userStatsFromGame['playerstats']['stats'][userStat].name.includes('last')){
            lastMatchData[userStatsFromGame['playerstats']['stats'][userStat].name] = userStatsFromGame['playerstats']['stats'][userStat].value; 
        }
    })
    return lastMatchData; 
}

function parseGeneralMatchData(userStatsFromGame){
    const tempRef = userStatsFromGame['playerstats']['stats']
    const generalMatchData = {}; 
    const individuleGunData = {};
    const keyPairsForGeneralStats = [['total_kills','total_deaths','KD_Ratio'],['total_kills_headshot','total_kills','HS_Ratio'],['total_shots_hit','total_shots_fired','accuracy'],['total_wins','total_rounds_played','round_win_ratio'],['total_mvps','total_rounds_played','MVP_ratio'],['total_matches_won','total_matches_played','Win_ratio']]
        // compare as in key3 = (key1 / key2) thats it... used for finding averages and things. 
    const gunIDS = ['awp','ak47','aug','deagle','glock','elite','fiveseven','famas','g3sg1','p90','mac10','ump45','xm1014','m249','hkp2000','p250','sg556','scar20','ssg08','mp7','nova','negev','sawedoff','bizon','tec9','mag7','m4a1','galilar'] 
    const keysForGunStats =['total_shots_','total_hits_','total_kills_'] 
        // with these stats we can calculate, weapon accuracy, weapon avg shots to kill, weapon avg hit to kill, usefull for determining headshot% for given weapon\
    for(let i = 0; i < keyPairsForGeneralStats.length; i++){
        generalMatchData[keyPairsForGeneralStats[i][2]] = tempRef[getStatIndex(tempRef,keyPairsForGeneralStats[i][0])].value / tempRef[getStatIndex(tempRef,keyPairsForGeneralStats[i][1])].value; 
    }
    for(let i = 0; i < gunIDS.length; i++){
        const total_shots_currentGun = tempRef[getStatIndex(tempRef,`${keysForGunStats[0]}${gunIDS[i]}`)].value;
        const total_hits_currentGun = tempRef[getStatIndex(tempRef,`${keysForGunStats[1]}${gunIDS[i]}`)].value;
        const total_kills_currentGun = tempRef[getStatIndex(tempRef,`${keysForGunStats[2]}${gunIDS[i]}`)].value;
        const currentGunStats = 
        {
            accuracy: total_hits_currentGun/total_shots_currentGun,
            'shots_kill': total_shots_currentGun / total_kills_currentGun,
            'hits_kill' : total_hits_currentGun/total_kills_currentGun,
        }
        generalMatchData[gunIDS[i]] = currentGunStats
    }
    return generalMatchData; 
}

function getStatIndex(statsList,name){
    let statIndex = 0; 
    statsList.forEach((stat,index)=>{
        if(stat.name == name){
            statIndex = index; 
        }
    })
    return statIndex; 
}

async function getUserBanRecord(steamids){ // only call once with all steam ids 
    // const maxsteamids = 
    const maxSteamids = 100; 
    const URL = 'https://api.steampowered.com/ISteamUser/GetPlayerBans/v1/'
    let response = await createRequest(`${URL}?key=${key}&steamids=${(steamids.slice(0,100))}`);
    return parseUserBanRecord(response); 
}

function parseUserBanRecord(res){
    return res['players']; 
}

async function getUserSteamLevel(steamid){
    const URL = 'https://api.steampowered.com/IPlayerService/GetSteamLevel/v1/'
    const response = await createRequest(`${URL}?key=${key}&steamid=${(steamid)}`)
    return parseUserSteamLevel(response); 
}

function parseUserSteamLevel(res){
    if(res['response']){
        return res['response']['player_level']
    }
    return {}; 
}

async function getUserHoursPlayed(steamid){
    const URL = 'https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/'
    console.log(steamid)
    const response = await createRequest(`${URL}?key=${key}&steamid=${BigInt(steamid)}&include_appinfo=false&include_played_free_games=true`);
    return parseHoursPlayed(response); 
}

function parseHoursPlayed(res){
    if(res['response']['games']){
        const userGamesOwned = res['response']['game_count'];
        const userCSGOPlayTime = res['response']['games'].filter((val)=>{
            return val['appid'] == 730; 
        })
        return {
            'games_owned':userGamesOwned,
            'play_time': userCSGOPlayTime[0]["playtime_forever"],
        }
    }
    return {}
}

function parseSteamIDs(str){
    const splitBySpace = str.split(' '); 
    const steamIDs = splitBySpace.filter(val=>{
        return (val.includes('STEAM'))
    })
    return steamIDs; 
}

function steamIDtosteam64(steamid){
    const parsed = steamid.split(':'); 
    const x = parsed[1]; 
    const y = parsed[2]; 
    return (BigInt(y) * 2n) + BigInt(x) + 76561197960265728n;
}

module.exports = router;
/*
    step 1 on POST: 
        parse the large string into the steamids,
        parse the steamids, convert into steam64ids
    step 2: 
        using the steam64ids call each steam api and fill the payload: 
            FORMAT:
            [UsersSteamID]:
                {
                    'owned_game_data' : {},
                    'user_data' : {},
                    'steam_level': 0,
                    'user_vac_ban':{},
                    'user_ban_record':{},
                    'user_game_stats':{},
                }
    step 3: 
        Insert / update players in the database
    step 4: 
        res.json(payload)
*/