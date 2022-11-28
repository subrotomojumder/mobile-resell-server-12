const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');
require('dotenv').config()
const port = process.env.PORT || 5000;
const app = express();

const stripe = require("stripe")(process.env.STRIPE_SECRET);

app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.uxk5wr6.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

const verifyJwt = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).send({ message: 'unauthorized' })
    }
    const token = authHeader.split(' ')[1];
    jwt.verify(token, process.env.SECRET_TOKEN, function (err, decoded) {
        if (err) {
            return res.status(403).send({ message: 'forbidden access' })
        }
        req.decoded = decoded;
        next()
    })
}

async function run() {
    const usersCollection = client.db("mobile-resell").collection("users");
    const phonesCollection = client.db("mobile-resell").collection("phones");
    const categoryCollection = client.db("mobile-resell").collection("category");
    const orderCollection = client.db("mobile-resell").collection("orders");
    const paymentCollection = client.db("mobile-resell").collection("payments");
    const reportCollection = client.db("mobile-resell").collection("reports");
    // admin verify middleware 
    const verifyAdmin = async (req, res, next) => {
        const decodedEmail = req.decoded.email;
        const query = { email: decodedEmail };
        const user = await usersCollection.findOne(query);
        if (user?.role !== 'Admin') {
            return res.status(403).send({ message: 'forbidden access' })
        }
        next();
    }
    // verify seller middleware
    const verifySeller = async (req, res, next) => {
        const decodedEmail = req.decoded.email;
        const query = { email: decodedEmail };
        const user = await usersCollection.findOne(query);
        if (user?.role !== 'Sellers') {
            return res.status(403).send({ message: 'forbidden access' })
        }
        next();
    }

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
    app.get('/users/role/:email', async (req, res) => {
        const email = req.params.email;
        const query = { email: email };
        const user = await usersCollection.findOne(query);
        res.send({ role: user?.role })
    })
    app.get('/users/:userRole', verifyJwt, verifyAdmin, async (req, res) => {
        const useRole = req.params.userRole;
        if (useRole === 'sellers') {
            const query = { role: 'Sellers' };
            const sellers = await usersCollection.find(query).toArray();
            return res.send(sellers);
        }
        const buyers = await usersCollection.find({ $and: [{ role: { $ne: "Sellers" } }, { role: { $ne: "Admin" } }] }).toArray();
        res.send(buyers);
    })
    app.delete('/users/:id', verifyJwt, verifyAdmin, async (req, res) => {
        const filter = { _id: ObjectId(req.params.id) };
        const results = await usersCollection.deleteOne(filter);
        res.send(results);
    })
    app.patch('/users/sellers/:id', verifyJwt, verifyAdmin, async (req, res) => {
        const filter = { _id: ObjectId(req.params.id) };
        const updateDoc = {
            $set: { verified: true }
        }
        const results = await usersCollection.updateOne(filter, updateDoc);
        res.send(results);
    })
    app.get('/test/verify', async (req, res) => {
        const seller = req.query.seller;
        const query = { email: seller };
        const user = await usersCollection.findOne(query);
        res.send(user?.verified || false)
    })
    // manage products
    app.post('/products', verifyJwt, verifySeller, async (req, res) => {
        const product = req.body;
        const results = await phonesCollection.insertOne(product);
        res.send(results)
    })
    app.get('/products/:email', verifyJwt, verifySeller, async (req, res) => {
        const email = req.params.email;
        const query = { sellerEmail: email };
        const products = await phonesCollection.find(query).toArray();
        res.send(products)
    })
    app.delete('/products/:id', verifyJwt, verifySeller, async (req, res) => {
        const query = { _id: ObjectId(req.params.id) };
        const results = await phonesCollection.deleteOne(query);
        res.send(results);
    })
    app.get('/category/:name', async (req, res) => {
        const category = req.params.name;
        const query = { category: category };
        const phones = await phonesCollection.find(query).toArray();
        const availablePhones = phones.filter(phone => phone.paid !== true);
        res.send(availablePhones);
    })
    app.get('/category', async (req, res) => {
        const query = {};
        const categories = await categoryCollection.find(query).toArray();
        res.send(categories)
    })
    // manage orders
    app.post('/orders', verifyJwt, async (req, res) => {
        const phoneId = req.query.phoneId;
        const email = req.query.clientEmail;
        const order = req.body;
        const query = {
            phoneId: phoneId,
            clientEmail: email
        };
        const ordereds = await orderCollection.find(query).toArray();
        if (ordereds.length > 0) {
            return res.send({ acknowledged: false, message: `Already ordered ${order.phoneName} mobile` })
        }
        const results = await orderCollection.insertOne(order);
        res.send(results)
        // const addStatus = await phonesCollection.updateOne(filter, updateDoc);
    })
    app.get('/orders', verifyJwt, async (req, res) => {
        const email = req.decoded.email;
        const query = { clientEmail: email };
        const myOrders = await orderCollection.find(query).toArray();
        res.send(myOrders);
    })
    app.delete('/orders/:id', verifyJwt, async (req, res, next) => {
        const query = { _id: ObjectId(req.params.id) };
        const results = await orderCollection.deleteOne(query);
        res.send(results)
    })
    app.get('/orders/:id', async (req, res) => {
        const orderID = req.params.id;
        const query = { _id: ObjectId(orderID) };
        const order = await orderCollection.findOne(query);
        res.send(order)
    })
    // create payment intent
    app.post('/create-payment-intent', verifyJwt, async (req, res) => {
        const order = req.body;
        const price = order.price;
        const amount = price * 100;

        const paymentIntent = await stripe.paymentIntents.create({
            amount: amount,
            currency: "usd",
            "payment_method_types": [
                "card"
            ],
        })
        res.send({ clientSecret: paymentIntent.client_secret });
    })
    // payments api
    app.post('/payments', async (req, res) => {
        const payment = req.body;
        const phoneQuery = { _id: ObjectId(payment.phoneId) };
        const orderQuery = { _id: ObjectId(payment.orderId) };
        const updateDoc = {
            $set: {
                paid: true
            }
        }
        const phoneUpdate = await phonesCollection.updateOne(phoneQuery, updateDoc);
        const orderUpdate = await orderCollection.updateOne(orderQuery, updateDoc)
        const results = await paymentCollection.insertOne(payment);
        res.send(results);
    })

    // advertise api
    app.put('/advertised/:id', verifyJwt, async (req, res) => {
        const phoneId = req.params.id;
        const filter = { _id: ObjectId(phoneId) };
        const updateDoc = {
            $set: {
                advertise: true,
            }
        };
        const results = await phonesCollection.updateOne(filter, updateDoc);
        res.send(results)
    })
    app.get('/advertised', async (req, res) => {
        const allPhones = await phonesCollection.find({}).toArray();
        const withoutPaid = allPhones.filter(phone => phone.paid !== true);
        const advertised = withoutPaid.filter(phone => phone.advertise);
        res.send(advertised)
    })
    app.post('/reports', verifyJwt, async (req, res)=> {
        const report = req.body;
        const results = await reportCollection.insertOne(report);
        res.send(results)
    })
    app.get('/reports', verifyJwt, verifyAdmin, async (req, res)=> {
        const reports = await reportCollection.find({}).toArray();
        res.send(reports)
    })
    app.get('/', (req, res) => {
        res.send('resell product server is running')
    })
}
run().catch(e => console.log(e))

app.listen(port, () => {
    console.log('resell server port:', port)
})