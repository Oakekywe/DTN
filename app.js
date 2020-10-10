'use strict';
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const APP_URL = process.env.APP_URL;

//new text

// Imports dependencies and set up http server
const 
  { uuid } = require('uuidv4'),
  {format} = require('util'),
  request = require('request'),
  express = require('express'),
  body_parser = require('body-parser'),
  firebase = require("firebase-admin"),
  ejs = require("ejs"),  
  fs = require('fs'),
  multer  = require('multer'),  
  app = express(); 

const uuidv4 = uuid();


app.use(body_parser.json());
app.use(body_parser.urlencoded());

let currentuser = {};

let current_question = '';

let user_id = ''; 

let userInputs = [];
/*
var storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/')
  },
  filename: function (req, file, cb) {
    cb(null, file.originalname);
  }
})*/

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits :{
    fileSize: 50 * 1024 * 1024  //no larger than 5mb
  }

});

// parse application/x-www-form-urlencoded


app.set('view engine', 'ejs');
app.set('views', __dirname+'/views');


var firebaseConfig = {
     credential: firebase.credential.cert({
    "private_key": process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    "client_email": process.env.FIREBASE_CLIENT_EMAIL,
    "project_id": process.env.FIREBASE_PROJECT_ID,    
    }),
    databaseURL: process.env.FIREBASE_DB_URL,   
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET
  };



firebase.initializeApp(firebaseConfig);

let db = firebase.firestore(); 
let bucket = firebase.storage().bucket();

// Sets server port and logs message on success
app.listen(process.env.PORT || 1337, () => console.log('webhook is listening'));

// Accepts POST requests at /webhook endpoint
app.post('/webhook', (req, res) => {  

  // Parse the request body from the POST
  let body = req.body;

  

  // Check the webhook event is from a Page subscription
  if (body.object === 'page') {
    body.entry.forEach(function(entry) {

      let webhook_event = entry.messaging[0];
      let sender_psid = webhook_event.sender.id; 

      user_id = sender_psid; 

      if(!userInputs[user_id]){
        userInputs[user_id] = {};
      }    


      if (webhook_event.message) {
        if(webhook_event.message.quick_reply){
            handleQuickReply(sender_psid, webhook_event.message.quick_reply.payload);
          }else{
            handleMessage(sender_psid, webhook_event.message);                       
          }                
      } else if (webhook_event.postback) {        
        handlePostback(sender_psid, webhook_event.postback);
      }
      
    });
    // Return a '200 OK' response to all events
    res.status(200).send('EVENT_RECEIVED');

  } else {
    // Return a '404 Not Found' if event is not from a page subscription
    res.sendStatus(404);
  }

});

app.use('/uploads', express.static('uploads'));


app.get('/',function(req,res){    
    res.send('your app is up and running');
});

app.get('/register/:sender_id',function(req,res){ 
    const sender_id = req.params.sender_id;   
    res.render('register.ejs',{title:"register user", sender_id:sender_id});
});


app.post('/register',function(req,res){
       
      currentuser.name  = req.body.name;
      currentuser.email = req.body.email;
      currentuser.phone = req.body.phone;
      currentuser.sender = req.body.sender;  

      let data = {
        userid: user_id,
        name:  currentuser.name,
        email: currentuser.email,
        phone: currentuser.phone
    }
      
      console.log("ABCDEF");
        db.collection('registers').doc(user_id).set(data)
        .then(success => {   
          console.log("DATA SAVED")
          Thankyou(currentuser.sender);
      }).catch(error => {
          console.log(error);
      }); 
     
           
});


/*********************************************
Admin Check Order
**********************************************/
app.get('/admin/orders', async function(req,res){
 
  const ordersRef = db.collection('orders');
  const snapshot = await ordersRef.get();

  if (snapshot.empty) {
    res.send('no data');
  } 

  let data = []; 

  snapshot.forEach(doc => {
    let order = {};
    order = doc.data();
    order.doc_id = doc.id;

    data.push(order);
    
  });

  console.log('DATA:', data);

  res.render('appointments.ejs', {data:data});
  
});

app.get('/admin/appointments', async function(req,res){
 
  const appointmentsRef = db.collection('appointments');
  const snapshot = await appointmentsRef.get();

  if (snapshot.empty) {
    res.send('no data');
  } 

  let data = []; 

  snapshot.forEach(doc => {
    let appointment = {};
    appointment = doc.data();
    appointment.doc_id = doc.id;

    data.push(appointment);
    
  });

  console.log('DATA:', data);

  res.render('appointments.ejs', {data:data});
  
});

app.get('/admin/updateappointment/:doc_id', async function(req,res){
  let doc_id = req.params.doc_id; 
  
  const appoinmentRef = db.collection('appointments').doc(doc_id);
  const doc = await appoinmentRef.get();
  if (!doc.exists) {
    console.log('No such document!');
  } else {
    console.log('Document data:', doc.data());
    let data = doc.data();
    data.doc_id = doc.id;

    console.log('Document data:', data);
    res.render('editappointment.ejs', {data:data});
  } 

});


app.post('/admin/updateappointment', function(req,res){
  console.log('REQ:', req.body); 

  

  let data = {
    name:req.body.name,
    phone:req.body.phone,
    email:req.body.email,
    gender:req.body.gender,
    doctor:req.body.doctor,
    department:req.body.department,
    visit:req.body.visit,
    date:req.body.date,
    time:req.body.time,
    message:req.body.message,
    status:req.body.status,
    doc_id:req.body.doc_id,
    ref:req.body.ref,
    comment:req.body.comment
  }

  db.collection('appointments').doc(req.body.doc_id)
  .update(data).then(()=>{
      res.redirect('/admin/appointments');
  }).catch((err)=>console.log('ERROR:', error)); 
 
});

/*********************************************
Gallery page
**********************************************/
app.get('/showimages/:sender_id/',function(req,res){
    const sender_id = req.params.sender_id;

    let data = [];

    db.collection("images").limit(20).get()
    .then(  function(querySnapshot) {
        querySnapshot.forEach(function(doc) {
            let img = {};
            img.id = doc.id;
            img.url = doc.data().url;         

            data.push(img);                      

        });
        console.log("DATA", data);
        res.render('gallery.ejs',{data:data, sender_id:sender_id, 'page-title':'welcome to my page'}); 

    }
    
    )
    .catch(function(error) {
        console.log("Error getting documents: ", error);
    });    
});


app.post('/imagepick',function(req,res){
      
  const sender_id = req.body.sender_id;
  const doc_id = req.body.doc_id;

  console.log('DOC ID:', doc_id); 

  db.collection('images').doc(doc_id).get()
  .then(doc => {
    if (!doc.exists) {
      console.log('No such document!');
    } else {
      const image_url = doc.data().url;

      console.log('IMG URL:', image_url);

      let response = {
      "attachment": {
        "type": "template",
        "payload": {
          "template_type": "generic",
          "elements": [{
            "title": "Is this the image you like?",
            "image_url":image_url,                       
            "buttons": [
                {
                  "type": "postback",
                  "title": "Yes!",
                  "payload": "yes",
                },
                {
                  "type": "postback",
                  "title": "No!",
                  "payload": "no",
                }
              ],
          }]
        }
      }
    }

  
    callSend(sender_id, response); 
    }
  })
  .catch(err => {
    console.log('Error getting document', err);
  });
      
});



/*********************************************
END Gallery Page
**********************************************/
app.get('/loginform/:sender_id',function(req,res){
    const sender_id = req.params.sender_id;
    res.render('loginform.ejs',{title:"Login user", sender_id:sender_id});
});
//webview test
app.get('/webview/:sender_id',function(req,res){
    const sender_id = req.params.sender_id;
    res.render('webview.ejs',{title:"Hello!! from WebView", sender_id:sender_id});
});

app.post('/webview',upload.single('file'),function(req,res){
       
      let name  = req.body.name;
      let email = req.body.email;
      let img_url = "";
      let sender = req.body.sender;  

      console.log("REQ FILE:",req.file);
console.log("abcd");
      let file = req.file;
      if (file) {
        uploadImageToStorage(file).then((img_url) => {
            db.collection('webview').add({
              name: name,
              email: email,
              image: img_url
              }).then(success => {   
                console.log("DATA SAVED")
                thankyouReply(sender, name, img_url);    
              }).catch(error => {
                console.log(error);
              }); 
        }).catch((error) => {
          console.error(error);
        });
      }
     
           
});

//Set up Get Started Button. To run one time
//eg https://fbstarter.herokuapp.com/setgsbutton
app.get('https://okphdessert.herokuapp.com/setgsbutton',function(req,res){
    setupGetStartedButton(res);    
});

//Set up Persistent Menu. To run one time
//eg https://fbstarter.herokuapp.com/setpersistentmenu
app.get('/setpersistentmenu',function(req,res){
    setupPersistentMenu(res);    
});

//Remove Get Started and Persistent Menu. To run one time
//eg https://fbstarter.herokuapp.com/clear
app.get('/clear',function(req,res){    
    removePersistentMenu(res);
});

//whitelist domains
//eg https://fbstarter.herokuapp.com/whitelists
app.get('/whitelists',function(req,res){    
    whitelistDomains(res);
});


// Accepts GET requests at the /webhook endpoint
app.get('/webhook', (req, res) => {
  

  const VERIFY_TOKEN = process.env.VERIFY_TOKEN;  

  let mode = req.query['hub.mode'];
  let token = req.query['hub.verify_token'];
  let challenge = req.query['hub.challenge'];  
    
  // Check token and mode
  if (mode && token) {
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      res.status(200).send(challenge);    
    } else {      
      res.sendStatus(403);      
    }
  }
});

/**********************************************
Function to Handle when user send quick reply message
***********************************************/

function handleQuickReply(sender_psid, received_message) {

  console.log('QUICK REPLY', received_message);

  received_message = received_message.toLowerCase();

  if(received_message.startsWith("visit:")){
    let visit = received_message.slice(6);    
    userInputs[user_id].visit = visit;
    
    current_question = 'q1';
    botQuestions(current_question, sender_psid);
  }
  
  else{

      switch(received_message) {     
                     
        case "on":
            showQuickReplyOn(sender_psid);
          break;
        case "off":
            showQuickReplyOff(sender_psid);
          break; 
                              
        default:
            defaultReply(sender_psid);
    } 

  }  
 
}

/**********************************************
Function to Handle when user send text message
***********************************************/

const handleMessage = (sender_psid, received_message) => {

  console.log('TEXT REPLY', received_message);
  //let message;

  let response;
 if(received_message.attachments){
     handleAttachments(sender_psid, received_message.attachments);
  }else if(current_question == 'q1'){
     console.log('DATE ENTERED',received_message.text);
     userInputs[user_id].date = received_message.text;
     current_question = 'q2';
     Questions(current_question, sender_psid);
  }

  else {
      
      let user_message = received_message.text;      
     
      user_message = user_message.toLowerCase(); 

      switch(user_message) { 
      case "hi":
          hiReply(sender_psid);
        break;                    
      case "text":
        textReply(sender_psid);
        break;
      case "quick":
        quickReply(sender_psid);
        break;
      case "button":                  
        buttonReply(sender_psid);
        break;
      case "webview":
        webviewTest(sender_psid);
        break;       
      case "show images":
        showImages(sender_psid)
        break;               
      default:
          defaultReply(sender_psid);
      }            
      
    }

}

/*********************************************
Function to handle when user send attachment
**********************************************/

const handleAttachments = (sender_psid, attachments) => {
  
  console.log('ATTACHMENT', attachments);


  let response; 
  let attachment_url = attachments[0].payload.url;
    response = {
      "attachment": {
        "type": "template",
        "payload": {
          "template_type": "generic",
          "elements": [{
            "title": "Is this the right picture?",
            "subtitle": "Tap a button to answer.",
            "image_url": attachment_url,
            "buttons": [
              {
                "type": "postback",
                "title": "Yes!",
                "payload": "yes-attachment",
              },
              {
                "type": "postback",
                "title": "No!",
                "payload": "no-attachment",
              }
            ],
          }]
        }
      }
    }
    callSend(sender_psid, response);
}


/*********************************************
Function to handle when user click button
**********************************************/
const handlePostback = (sender_psid, received_postback) => {  

  let payload = received_postback.payload;

  console.log('BUTTON PAYLOAD', payload);

  
  if(payload.startsWith("Doctor:")){
    let doctor_name = payload.slice(7);
    console.log('SELECTED DOCTOR IS: ', doctor_name);
    userInputs[user_id].doctor = doctor_name;
    console.log('TEST', userInputs);
    firstOrFollowUp(sender_psid);
  }
  else{

      switch(payload) { 
      
      case "yes":
          showButtonReplyYes(sender_psid);
        break;
      case "no":
          showButtonReplyNo(sender_psid);
        break;
                          
      default:
          defaultReply(sender_psid);
    } 

  }
  
}

const generateRandom = (length) => {
   var result           = '';
   var characters       = 'AZ123';
   var charactersLength = characters.length;
   for ( var i = 0; i < length; i++ ) {
      result += characters.charAt(Math.floor(Math.random() * charactersLength));
   }
   return result;
}

/*********************************************
GALLERY SAMPLE
**********************************************/

const showImages = (sender_psid) => {
  let response;
  response = {
      "attachment": {
        "type": "template",
        "payload": {
          "template_type": "generic",
          "elements": [{
            "title": "show images",                       
            "buttons": [              
              {
                "type": "web_url",
                "title": "enter",
                "url":"https://fbstarter.herokuapp.com/showimages/"+sender_psid,
                 "webview_height_ratio": "full",
                "messenger_extensions": true,          
              },
              
            ],
          }]
        }
      }
    }
  callSendAPI(sender_psid, response);
}


/*********************************************
END GALLERY SAMPLE
**********************************************/


function webviewTest(sender_psid){
  let response;
  response = {
      "attachment": {
        "type": "template",
        "payload": {
          "template_type": "generic",
          "elements": [{
            "title": "Click to open webview?",                       
            "buttons": [              
              {
                "type": "web_url",
                "title": "webview",
                "url":APP_URL+"webview/"+sender_psid,
                 "webview_height_ratio": "full",
                "messenger_extensions": true,          
              },
              
            ],
          }]
        }
      }
    }
  callSendAPI(sender_psid, response);
}


/**************
start order
**************/
const startReply = (sender_psid) => {
   let response1 = {"text": "Welcome to our DTN dessert shop, you can order our menu. You can make donation with us. You can be a loyal member. "};
   let response2 = {
         "attachment": {
                "type": "template",
                "payload": {
                  "template_type": "generic",
                  "elements": [{
                    "title": "See our delicious menu",
                    "subtitle": "Here's menu",
                    "image_url":"https://tourisminmyanmar.com.mm/wp-content/uploads/2019/08/rsz_shutterstock_1009625584.jpg",                       
                    "buttons": [
                        {
                          "type": "postback",
                          "title": "Order Now",
                          "payload": "order",
                        },               
                      ],
                  },{
                    "title": "Donation with us",
                    "subtitle": "You can donate with our dessert as representative",
                    "image_url":"https://www.charitytoday.co.uk/wp-content/uploads/2020/06/Donate.jpg",                       
                    "buttons": [
                        {
                          "type": "postback",
                          "title": "Donate",
                          "payload": "donate",
                        },               
                      ],
                  },{
                    "title": "Loyalty",
                    "subtitle": "You can be a loyal member now",
                    "image_url":"https://www.magesolution.com/blog/wp-content/uploads/2020/01/customer-engagement-loyalty.jpg",                       
                    "buttons": [
                        {
                          "type": "postback",
                          "title": "Loyalty",
                          "payload": "loyalty",
                        },               
                      ],
                  }

                  ]
                }
              }
    
 };

  callSend(sender_psid, response1).then(()=>{
    return callSend(sender_psid, response2);
  });
}


const showOrder = (sender_psid) => {
    let response1 = {"text": "Here's our available menu now. You can check detail of dessert. "};
    let response2 = {
      "attachment": {
        "type": "template",
        "payload": {
          "template_type": "generic",
          "elements": [{
            "title": "Sanwin Makin",
            "subtitle": "Dessert",
            "image_url":"https://cdn.kuali.com/wp-content/uploads/2017/10/Sanwin-Makin..jpg",                       
            "buttons": [
                {
                  "type": "postback",
                  "title": "Show more",
                  "payload": "sanwinMakin",
                },               
              ],
          },{
            "title": "Pudding",
            "subtitle": "Dessert",
            "image_url":"https://i.pinimg.com/564x/75/47/d8/7547d8cca6bc0fd3a9840c72e0fe6acf.jpg",                       
            "buttons": [
                {
                  "type": "postback",
                  "title": "Show more",
                  "payload": "pudding",
                },               
              ],
          }

          ]
        }
      }
    }
     callSend(sender_psid, response1).then(()=>{
        return callSend(sender_psid, response2);
      });
}


const showSanwinmakin = (sender_psid) => {
    let response1 = {"text": "We have 4 types of Sanwin Makin. You can order as follow: "};
    let response2 = {
      "attachment": {
        "type": "template",
        "payload": {
          "template_type": "generic",
          "elements": [{
            "title": "Shwe Kyi Sanwin Makin",
            "subtitle": "This type of Sanwin Makin is made with Shwe Kyi and the original taste of Sanwin Makin.",
            "image_url":"https://scontent.frgn5-2.fna.fbcdn.net/v/t31.0-0/p180x540/415606_4691000434420_355451047_o.jpg?_nc_cat=109&_nc_sid=2c4854&_nc_eui2=AeF2M9RhymkUvzblKIVEcaVYZZ9IqNQbMhlln0io1BsyGeUUZNECSYed1motoMAU3T3XXsplzubf4UwghXbirA2G&_nc_ohc=kx_5FjqU2noAX_FLDXz&_nc_ht=scontent.frgn5-2.fna&tp=6&oh=2dccc6bd79739ae9a566cae4baadf8eb&oe=5F9EDD53",                       
            "buttons": [
                {
                  "type": "postback",
                  "title": "Order $7000",
                  "payload": "SanwinMakin:Shwe Kyi Sanwin Makin",
                },               
              ],
          },{
            "title": "Potato Sanwin Makin",
            "subtitle": "This type of Sanwin Makin is made with Potato and its taste is cheesy.",
            "image_url":"https://i.pinimg.com/originals/00/5f/cf/005fcf0186075132975c0667d4c0c005.jpg",                       
            "buttons": [
                {
                  "type": "postback",
                  "title": "Order $6000",
                  "payload": "SanwinMakin:Potato Sanwin Makin",
                },               
              ],
          },{
            "title": "Milk Sanwin Makin",
            "subtitle": "This type of Sanwin Makin is made with Milk and its taste is sweet.",
            "image_url":"https://burmaspice.com/wp-content/uploads/2018/08/Burma-Spice-South-East-Asian-Burmese-Recipe-Burmese-Semolina-Cake_web-res.jpg",                       
            "buttons": [
                {
                  "type": "postback",
                  "title": "Order $6000",
                  "payload": "SanwinMakin:Milk Sanwin Makin",
                },               
              ],
          },{
            "title": "Banana Sanwin Makin",
            "subtitle": "This type of Sanwin Makin is made with Banana and its taste is a little bit sour.",
            "image_url":"https://scontent.frgn5-2.fna.fbcdn.net/v/t1.0-0/p526x296/102871159_948419118950746_478899810489249804_n.jpg?_nc_cat=102&_nc_sid=8bfeb9&_nc_eui2=AeFNEWd47jK_lkwdilqwV_h8WnacIXjhOhJadpwheOE6EsH59hBDO-Nk8-bL2cLd4G0G_Gbp47yqo93cdH9-0Na0&_nc_ohc=PzURL4fQxDQAX-9tx3p&_nc_ht=scontent.frgn5-2.fna&tp=6&oh=b736bed6a074bb67889f7f3db210d199&oe=5F9EA75E",                       
            "buttons": [
                {
                  "type": "postback",
                  "title": "Order $8000",
                  "payload": "SanwinMakin:Banana Sanwin Makin",
                },               
              ],
          }

          ]
        }
      }
    }
     callSend(sender_psid, response1).then(()=>{
        return callSend(sender_psid, response2);
      });
}

const showPudding = (sender_psid) => {
    let response1 = {"text": "Here is a baked pudding. "};
    let response2 = {
      "attachment": {
        "type": "template",
        "payload": {
          "template_type": "generic",
          "elements": [{
            "title": "Pudding",
            "subtitle": "This type of pudding is baked and it is soft and sweet.",
            "image_url":"https://www.southeast-asia.com/wp-content/uploads/2020/09/Cassava-Cake_mimomotaro.jpg",                       
            "buttons": [
                {
                  "type": "postback",
                  "title": "Order $4000",
                  "payload": "orderPudding",
                },               
              ],
          }

          ]
        }
      }
    }
     callSend(sender_psid, response1).then(()=>{
        return callSend(sender_psid, response2);
      });
}

const quantity = (sender_psid) => {

  let response = {
    "text": "How many trays do you want to order?",
    "quick_replies":[
            {
              "content_type":"text",
              "title":"1",
              "payload":"quantity:1",              
            },{
              "content_type":"text",
              "title":"2",
              "payload":"quantity:2",             
            },{
              "content_type":"text",
              "title":"3",
              "payload":"quantity:3",             
            }
    ]
  };
  callSend(sender_psid, response);

}


const Questions = (current_question,sender_psid) => {
  if(current_question == 'q1'){
    let response = {"text": questions.q1};
    callSend(sender_psid, response);
  }else if(current_question == 'q2'){
    let response = {"text": questions.q2};
    callSend(sender_psid, response);
  }else if(current_question == 'q3'){
    let response = {"text": questions.q3};
    callSend(sender_psid, response);
  }else if(current_question == 'q4'){
    let response = {"text": questions.q4};
    callSend(sender_psid, response);
  }else if(current_question == 'q5'){
    let response = {"text": questions.q5};
    callSend(sender_psid, response);
  }
}


const pickupordelivery = (sender_psid) => {

  let response = {
    "text": "Do you want to pick up or delivery for your order?",
    "quick_replies":[
            {
              "content_type":"text",
              "title":"Pick up",
              "payload":"pickup",              
            },{
              "content_type":"text",
              "title":"Delivery",
              "payload":"delivery",             
            }
    ]
  };
  callSend(sender_psid, response);

}

const confirmOrder = (current_question, sender_psid) => {
console.log('ORDER INFO', userInputs);
  let abc = "type:" + userInputs[user_id].type + "\u000A";
  abc += "sanwinmakin:" + userInputs[user_id].SanwinMakin + "\u000A";
  abc += "quantity:" + userInputs[user_id].quantity + "\u000A";
  abc += "date:" + userInputs[user_id].date + "\u000A";
  abc += "name:" + userInputs[user_id].name + "\u000A";
  abc += "phone:" + userInputs[user_id].phone + "\u000A";
  abc += "email:" + userInputs[user_id].email + "\u000A";
  abc += "message:" + userInputs[user_id].message + "\u000A";
  abc += "pickup:" + userInputs[user_id].pickup + "\u000A";  

  let response1 = {"text": abc};

  let response2 = {
    "text": "Confirm your order now.",
    "quick_replies":[
            {
              "content_type":"text",
              "title":"Confirm",
              "payload":"confirmorder",              
            },{
              "content_type":"text",
              "title":"Cancel",
              "payload":"off",             
            }
    ]
  };
  
  callSend(sender_psid, response1).then(()=>{
    return callSend(sender_psid, response2);
  });
}

const saveOrder = (arg, sender_psid) => {
  let data = arg;
  data.ref = generateRandom(5);
  data.status = "pending";
  db.collection('orders').add(data).then((success)=>{
    console.log('SAVED', success);
    let text = "Thank you for your order."+ "\u000A";
    text += "We will confirm your order soon."+ "\u000A";
    text += "Your order reference code is:" + data.ref;
    let response = {"text": text};
    callSend(sender_psid, response);
  }).catch((err)=>{
     console.log('Error', err);
  });
}

/**************
end order
**************/

const registerUser = async (message, response) => {

    const userRef = db.collection('users').doc(currentUser.id);
    const user = await userRef.get();
    if (!user.exists) {
        console.log('No such document!');
        let bot_message1 = new TextMessage(`Click on following link to register`); 
        let bot_message2 = new UrlMessage(APP_URL + '/register/');   
        response.send(bot_message1).then(()=>{
            return response.send(bot_message2);
        });
    } else {
      console.log('Document data:', user.data());      

      let bot_message3 = new TextMessage(`You are already registered`, actionKeyboard);    
      response.send(bot_message3);
    }    
}

const hiReply =(sender_psid) => {
  let response = {"text": "You sent hi message"};
  callSend(sender_psid, response);
}

const textReply =(sender_psid) => {
  let response = {"text": "You sent text message"};
  callSend(sender_psid, response);
}

const quickReply =(sender_psid) => {
  let response = {
    "text": "Select your reply",
    "quick_replies":[
            {
              "content_type":"text",
              "title":"On",
              "payload":"on",              
            },{
              "content_type":"text",
              "title":"Off",
              "payload":"off",             
            }
    ]
  };
  callSend(sender_psid, response);
}

const showQuickReplyOn =(sender_psid) => {
  let response = { "text": "You sent quick reply ON" };
  callSend(sender_psid, response);
}

const showQuickReplyOff =(sender_psid) => {
  let response = { "text": "You sent quick reply OFF" };
  callSend(sender_psid, response);
}

const buttonReply =(sender_psid) => {

  let response = {
      "attachment": {
        "type": "template",
        "payload": {
          "template_type": "generic",
          "elements": [{
            "title": "Are you OK?",
            "image_url":"https://www.mindrops.com/images/nodejs-image.png",                       
            "buttons": [
                {
                  "type": "postback",
                  "title": "Yes!",
                  "payload": "yes",
                },
                {
                  "type": "postback",
                  "title": "No!",
                  "payload": "no",
                }
              ],
          }]
        }
      }
    }

  
  callSend(sender_psid, response);
}

const showButtonReplyYes =(sender_psid) => {
  let response = { "text": "You clicked YES" };
  callSend(sender_psid, response);
}

const showButtonReplyNo =(sender_psid) => {
  let response = { "text": "You clicked NO" };
  callSend(sender_psid, response);
}
const Thankyou =(sender_psid) => {
  let response = { "text": "Thank you for sign up" };
  callSend(sender_psid, response);
}
const thankyouReply =(sender_psid, name, img_url) => {
  let response = {
      "attachment": {
        "type": "template",
        "payload": {
          "template_type": "generic",
          "elements": [{
            "title": "Thank you! " + name,
            "image_url":img_url,                       
            "buttons": [
                {
                  "type": "postback",
                  "title": "Yes!",
                  "payload": "yes",
                },
                {
                  "type": "postback",
                  "title": "No!",
                  "payload": "no",
                }
              ],
          }]
        }
      }
    }
  callSend(sender_psid, response);
}

function testDelete(sender_psid){
  let response;
  response = {
      "attachment": {
        "type": "template",
        "payload": {
          "template_type": "generic",
          "elements": [{
            "title": "Delete Button Test",                       
            "buttons": [              
              {
                "type": "web_url",
                "title": "enter",
                "url":"https://fbstarter.herokuapp.com/test/",
                 "webview_height_ratio": "full",
                "messenger_extensions": true,          
              },
              
            ],
          }]
        }
      }
    }
  callSendAPI(sender_psid, response);
}

const defaultReply = (sender_psid) => {
  let response = startReply(sender_psid);
  
    callSend(sender_psid, response) 
}

const callSendAPI = (sender_psid, response) => {   
  let request_body = {
    "recipient": {
      "id": sender_psid
    },
    "message": response
  }
  
  return new Promise(resolve => {
    request({
      "uri": "https://graph.facebook.com/v6.0/me/messages",
      "qs": { "access_token": PAGE_ACCESS_TOKEN },
      "method": "POST",
      "json": request_body
    }, (err, res, body) => {
      if (!err) {
        //console.log('RES', res);
        console.log('BODY', body);
        resolve('message sent!')
      } else {
        console.error("Unable to send message:" + err);
      }
    }); 
  });
}

async function callSend(sender_psid, response){
  let send = await callSendAPI(sender_psid, response);
  return 1;
}


const uploadImageToStorage = (file) => {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject('No image file');
    }
    let newFileName = `${Date.now()}_${file.originalname}`;

    let fileUpload = bucket.file(newFileName);

    const blobStream = fileUpload.createWriteStream({
      metadata: {
        contentType: file.mimetype,
         metadata: {
            firebaseStorageDownloadTokens: uuidv4
          }
      }
    });

    blobStream.on('error', (error) => {
      console.log('BLOB:', error);
      reject('Something is wrong! Unable to upload at the moment.');
    });

    blobStream.on('finish', () => {
      // The public URL can be used to directly access the file via HTTP.
      //const url = format(`https://storage.googleapis.com/${bucket.name}/${fileUpload.name}`);
      const url = format(`https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${fileUpload.name}?alt=media&token=${uuidv4}`);
      console.log("image url:", url);
      resolve(url);
    });

    blobStream.end(file.buffer);
  });
}




/*************************************
FUNCTION TO SET UP GET STARTED BUTTON
**************************************/

const setupGetStartedButton = (res) => {
  let messageData = {"get_started":{"payload":"get_started"}};

  request({
      url: 'https://graph.facebook.com/v2.6/me/messenger_profile?access_token='+ PAGE_ACCESS_TOKEN,
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      form: messageData
    },
    function (error, response, body) {
      if (!error && response.statusCode == 200) {        
        res.send(body);
      } else { 
        // TODO: Handle errors
        res.send(body);
      }
  });
} 

/**********************************
FUNCTION TO SET UP PERSISTENT MENU
***********************************/

const setupPersistentMenu = (res) => {
  var messageData = { 
      "persistent_menu":[
          {
            "locale":"default",
            "composer_input_disabled":false,
            "call_to_actions":[
                {
                  "type":"postback",
                  "title":"View My Tasks",
                  "payload":"view-tasks"
                },
                {
                  "type":"postback",
                  "title":"Add New Task",
                  "payload":"add-task"
                },
                {
                  "type":"postback",
                  "title":"Cancel",
                  "payload":"cancel"
                }
          ]
      },
      {
        "locale":"default",
        "composer_input_disabled":false
      }
    ]          
  };
        
  request({
      url: 'https://graph.facebook.com/v2.6/me/messenger_profile?access_token='+ PAGE_ACCESS_TOKEN,
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      form: messageData
  },
  function (error, response, body) {
      if (!error && response.statusCode == 200) {
          res.send(body);
      } else { 
          res.send(body);
      }
  });
} 

/***********************
FUNCTION TO REMOVE MENU
************************/

const removePersistentMenu = (res) => {
  var messageData = {
          "fields": [
             "persistent_menu" ,
             "get_started"                 
          ]               
  };  
  request({
      url: 'https://graph.facebook.com/v2.6/me/messenger_profile?access_token='+ PAGE_ACCESS_TOKEN,
      method: 'DELETE',
      headers: {'Content-Type': 'application/json'},
      form: messageData
  },
  function (error, response, body) {
      if (!error && response.statusCode == 200) {          
          res.send(body);
      } else {           
          res.send(body);
      }
  });
} 


/***********************************
FUNCTION TO ADD WHITELIST DOMAIN
************************************/

const whitelistDomains = (res) => {
  var messageData = {
          "whitelisted_domains": [
             APP_URL , 
             "https://herokuapp.com" ,                                   
          ]               
  };  
  request({
      url: 'https://graph.facebook.com/v2.6/me/messenger_profile?access_token='+ PAGE_ACCESS_TOKEN,
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      form: messageData
  },
  function (error, response, body) {
      if (!error && response.statusCode == 200) {          
          res.send(body);
      } else {           
          res.send(body);
      }
  });
} 