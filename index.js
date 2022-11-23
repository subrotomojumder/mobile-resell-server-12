const express = require('express');
const cors = require('cors');
const port = process.env.PORT || 5000;
const app = express();

app.use(cors());
app.use(express.json());

async function run(){
    app.get('/', (req, res)=> {
        res.send('resell product server is running')
    })
    
}
run().catch(e=> console.log(e))

app.listen(port, ()=> {
    console.log('resell server port:', port)
})