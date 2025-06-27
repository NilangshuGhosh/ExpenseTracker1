import express from "express";
import bodyParser from "body-parser";
import pg from "pg";
import bcrypt from "bcrypt";
import session from "express-session";
import passport from "passport";
import { Strategy } from "passport-local";
import env from "dotenv"
const app=express() ;
const port=3000;
const saltRounds=10;
let user_email;
app.use(bodyParser.urlencoded({extended:true}));

app.use(session({

secret: "TOPSECRETWORD",
    resave: false,
    saveUninitialized: true,
    rolling:true,
    cookie:{
        maxAge:10*60*1000
    }
}))

app.use(express.static("public"));
env.config();
const db=new pg.Client({
host:process.env.PG_HOST,
database:process.env.PG_DATABASE,
password:process.env.PG_PASSWORD,
port:process.env.PG_PORT,
user:process.env.PG_USER,
});
db.connect();


app.get("/",(req,res)=>{
if(req.session.email){
    console.log("Here Okay.")
    res.redirect("/index");
}
else{
    user_email="";
res.render("home.ejs");}
})


app.get("/login",(req,res)=>{
    user_email="";
    res.render("login.ejs");
})
app.get("/register",(req,res)=>{
    user_email="";
    res.render("register.ejs");
})


app.post("/login",async(req,res)=>{

const email=req.body["email"];
const password=req.body["password"];

try {

const prev=await db.query("SELECT * FROM identity  WHERE email=$1",[email]);
if(prev.rows.length==0){res.redirect("/register");}
const user=prev.rows[0];
const hashed_password=user.password;
bcrypt.compare(password,hashed_password,async(err,valid)=>{
if(err){
    console.log("Fatal error occured during password comparision.");
    res.redirect("/");
}
else if(valid){
    user_email=email;
const dat=await db.query("SELECT * FROM expense WHERE email=$1",[email]);
const data=dat.rows;
console.log(data);
req.session.email=email;

    res.render("index.ejs",{data:data});
}else{
    res.redirect("/");
}

})


} catch (error) {
    res.redirect("/");
}

})



app.post("/register",async(req,res)=>{
const email=req.body["email"];
const password=req.body["password"];


try {
const prev=await db.query("SELECT * FROM identity WHERE email=$1",[email]);
if(prev.rows.length>0){res.redirect("/login");}

bcrypt.hash(password,saltRounds,async(err,hashed_password)=>{
if(err){console.log("Fatal error while binding the password.");res.redirect("/");}
await db.query("INSERT INTO identity(email,password) VALUES($1,$2)",[email,hashed_password]);
console.log(email+" has registered with");
user_email=email;
req.session.email=email;
res.render("index.ejs");

}
)

} catch (error) {
    console.log(error);
    res.redirect("/");
}
})


app.get("/index",async(req,res)=>{

try {
    if(!req.session.email){
        console.log("Here Okay in get index.");
        res.redirect('/');}
    else{
const user_email=req.session.email;
  console.log("Here Okay in get index."+user_email);
const dat=await db.query("SELECT * FROM expense WHERE email=$1  ORDER BY entry_date DESC",[user_email]);
let data=(dat.rows);
console.log(data);

res.render("index.ejs",{data:data});  

    }
} catch (error) {
   res.render("home.ejs"); 
}



})


app.post("/index",async(req,res)=>{

try {

if(!req.session.email){
    
    console.log("Here");
    res.redirect('/');}
else{
    const user_email=req.session.email;
const formType=req.body["FormType"];
console.log(formType);
     if(formType=="FormC"){

 const amount=req.body["amount"];
const category=req.body["category"];
console.log(amount+user_email+category);
const date=new Date();
await db.query("INSERT INTO expense(email,amount,category,entry_date) VALUES($1,$2,$3,$4)",[user_email,amount,category,date]);
const dat=await db.query("SELECT * FROM expense WHERE email=$1 ORDER BY entry_date DESC",[user_email]);
const data=(dat.rows);

res.render("index.ejs",{data:data});  
}  
 if(formType=="FormA"){
console.log("Okay");
 const year=req.body["year"];
const month=req.body["month"];
let fl=0;
if(!(year&&month)){

    // Emon vabe banabo jate both kichu na diye search korle all data show hoi default.

const dat=await db.query("SELECT * FROM expense WHERE email=$1 ORDER BY entry_date DESC",[user_email]);
const data=(dat.rows);
console.log("Show All Data of user : "+user_email);
res.render("index.ejs",{data:data});  

}


else{
console.log(year);
// Format start date as YYYY-MM-01 then fine

console.log(year+" "+month);
const startDate = `${year}-${String(month).padStart(2, '0')}-01`;

console.log(startDate);

// Calculate first day of next month
const nextMonth = new Date(year, month, 1); 

const endDate = new Date(nextMonth.getFullYear(), nextMonth.getMonth(), 1)
  .toISOString()
  .split('T')[0]; // '2024-07-01'
console.log(endDate);



//await db.query("INSERT INTO expense(email,amount,category,entry_date) VALUES($1,$2,$3,$4)",[user_email,amount,category,date]);
console.log(user_email);
const dat=await db.query("SELECT * FROM expense WHERE email=$1 AND entry_date>=$2 AND entry_date<=$3 ORDER BY entry_date DESC",[user_email,startDate,endDate]);
//console.log(dat);
const data=(dat.rows);
console.log("Successfully searched");
res.render("index.ejs",{data:data});  


}
    }

}

} catch (error) {
   res.render("home.ejs"); 
}

})


app.get("/summary",async(req,res)=>{
try {
    if(!req.session.email){
    
    console.log("Here");
    res.redirect('/');}
    else{
        console.log("Okay in get summary.")
res.render("summary.ejs");
    }
} catch (error) {
    res.redirect("/");
}


})

app.post("/summary",async(req,res)=>{

try {
    if(!req.session.email){
    
    console.log("Here");
    res.redirect('/');}
    else{
const year=req.body['year'];
const month=req.body['month'];
const user=req.session.email;


   const categoryResult = await db.query(`
      SELECT category, SUM(amount) AS total
      FROM expense
      WHERE EXTRACT(YEAR FROM entry_date) = $1
        AND EXTRACT(MONTH FROM entry_date) = $2
        AND email = $3
      GROUP BY category
    `, [year, month, user]);
console.log("Okay");

res.render("summary.ejs",{categoryData:categoryResult.rows,year,month});


    }
} catch (error) {
    res.redirect("/");
}



})



app.listen(port,(req,res)=>{
console.log(`Server running on port ${port}`);
})
