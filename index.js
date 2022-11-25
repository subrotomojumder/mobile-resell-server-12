const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion } = require('mongodb');
const jwt = require('jsonwebtoken');
const port = process.env.PORT || 5000;
require('dotenv').config()
const app = express();

app.use(cors());
app.use(express.json());


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.uxk5wr6.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

async function run() {
    const usersCollection = client.db("mobile-resell").collection("users")
    const phonesCollection = client.db("mobile-resell").collection("phones")
    const categoryCollection = client.db("mobile-resell").collection("category")
    // handle user
    app.put('/users/:email', async (req, res) => {
        const email = req.params.email;
        const filter = { email: email };
        const options = { upsert: true };
        const user = req.body;
        const updateDoc = {
            $set: user,
        };
        const results = await usersCollection.updateOne(filter, updateDoc, options);
        const token = jwt.sign({ email }, process.env.SECRET_TOKEN, { expiresIn: '1d' });
        res.send({ results, token })
    })
    app.get('/users/role/:email', async(req, res)=> {
        const email = req.params.email;
        const query = {email: email};
        const user = await usersCollection.findOne(query);
        res.send({role: user.role})
    })
    // manage products
    app.post('/products', async (req, res) => {
        console.log(req.body)
        const product = req.body;
        const results = await phonesCollection.insertOne(product);
        res.send(results)
    })
    app.get('/category/:name', async (req, res) => {
        const category = req.params.name;
        const query = { category: category };
        const allPhones = await phonesCollection.find({}).toArray();
        const uniqueCatPhones = allPhones.filter(phone => phone.newPhone.category === category)
        res.send(uniqueCatPhones);
    })
    app.get('/category', async (req, res) => {
        const query = {};
        const categories = await categoryCollection.find(query).toArray();
        res.send(categories)
    })
    app.get('/', (req, res) => {
        res.send('resell product server is running')
    })
}
run().catch(e => console.log(e))

app.listen(port, () => {
    console.log('resell server port:', port)
})