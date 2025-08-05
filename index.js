
const { Client, LocalAuth } = require('whatsapp-web.js');
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const qrcode = require('qrcode');

const app = express();

app.use(cors());
app.use(express.json());

let qrCodeData = null;      
let isClientReady = false;

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    args: ['--no-sandbox']
  }
});

client.on('qr', qr => {
  console.log('QR Code généré');

  qrcode.toDataURL(qr, (err, url) => {
    if (err) {
      console.error('Erreur génération QR code:', err);
      qrCodeData = null;
    } else {
      qrCodeData = url;
      isClientReady = false;
    }
  });
});

client.on('ready', () => {
  console.log('✅ Client WhatsApp prêt');
  qrCodeData = null;
  isClientReady = true;
});

client.on('authenticated', () => {
  console.log('✅ Authentifié avec succès');
});

client.on('auth_failure', msg => {
  console.error('❌ Échec d\'authentification', msg);
  qrCodeData = null;
  isClientReady = false;
});

client.on('disconnected', reason => {
  console.log('⚠️ Déconnecté de WhatsApp', reason);
  isClientReady = false;
});

client.on('message', async message => {
    const fromNumber = message.from.split('@')[0];
    const timestamp = new Date(message.timestamp * 1000).toISOString(); // convert Unix timestamp
  
    console.log(`📥 Reçu de ${fromNumber} à ${timestamp}: ${message.body}`);
  
    await axios.post('https://api2.trave4lyou.ma/bot/messages/', {
      phone_number: fromNumber,
      message_preview: message.body,
      timestamp: timestamp,
      direction: "incoming"
    }).catch(err => console.error(err.message));
  });
  
  // ▶ Capte tous les messages envoyés (par le bot ou manuellement)
  client.on('message_create', async message => {
    const toNumber = message.to ? message.to.split('@')[0] : "inconnu";
    const timestamp = new Date(message.timestamp * 1000).toISOString();
  
    console.log(`📤 Envoyé à ${toNumber} à ${timestamp}: ${message.body}`);
  
    await axios.post('https://api2.travel4you.ma/bot/messages/', {
      phone_number: toNumber,
      message_preview: message.body,
      timestamp: timestamp,
      direction: "outgoing"
    }).catch(err => console.error(err.message));
  });
  
  // ▶ Capte les accusés de réception / lecture
  client.on('message_ack', (message, ack) => {
    const toNumber = message.to ? message.to.split('@')[0] : "inconnu";
    const statusMap = ['envoi', 'reçu', 'lu', 'lecture groupe', 'lecture serveur'];
    console.log(`📬 Accusé pour ${toNumber} → ${statusMap[ack] || ack}`);
  });
// Endpoint pour frontend React: statut et QR code
app.get('/whatsapp-status', (req, res) => {
  res.json({
    connected: isClientReady,
    qr: qrCodeData || null
  });
});

// Envoi relance clients (exemple)
const sendRelance = async () => {
  try {
    const response = await axios.get('https://api2.travel4you.ma/bot/clients-a-relancer/');
    const clients = response.data;

    for (const clientData of clients) {
      const numero = clientData.telephone.replace(/\D/g, '');
      const message = `Bonjour ${clientData.nom_complet}, nous vous recontactons pour votre demande de service.`;

      try {
        await client.sendMessage(`${numero}@c.us`, message);
        console.log(`✅ Message envoyé à ${numero}`);
      } catch (err) {
        console.error(`❌ Erreur envoi ${numero} :`, err.message);
      }
    }
  } catch (err) {
    console.error('Erreur récupération relance :', err.message);
  }
};

app.get('/send-relance', (req, res) => {
  sendRelance();
  res.json({ status: 'Relances envoyées' });
});
const sendPasInteresse = async () => {
    try {
      const response = await axios.get('https://api2.travel4you.ma/bot/clients-pas-interesse/');
      const clients = response.data;
  
      for (const clientData of clients) {
        const numero = clientData.telephone.replace(/\D/g, '');
        const message = `Bonjour ${clientData.nom_complet}, Nous restons disponibles.
        Vous pouvez consulter nos offres à tout moment sur notre site web : https://adgital.ma`;
  
        try {
          await client.sendMessage(`${numero}@c.us`, message);
          console.log(`✅ Message envoyé à ${numero}`);
        } catch (err) {
          console.error(`❌ Erreur envoi ${numero} :`, err.message);
        }
      }
    } catch (err) {
      console.error('Erreur récupération relance :', err.message);
    }
  };

  app.get('/send-clients-pas-interesse', (req, res) => {
    sendPasInteresse();
    res.json({ status: 'Relances envoyées' });
  });

// Envoi relance paiement
const sendRelancePayer = async () => {
  try {
    const response = await axios.get('https://api2.travel4you.ma/bot/clients-a-payer/');
    const clients = response.data;

    for (const clientData of clients) {
      const numero = clientData.telephone.replace(/\D/g, '');
      const message = `Bonjour ${clientData.nom_complet}, il vous reste ${clientData.balance_remaining} MAD à payer pour les services : ${clientData.services}. Merci de régulariser votre situation.`;

      try {
        await client.sendMessage(`${numero}@c.us`, message);
        console.log(`✅ Message envoyé à ${numero}`);
      } catch (err) {
        console.error(`❌ Erreur envoi ${numero} :`, err.message);
      }
    }
  } catch (err) {
    console.error('Erreur récupération paiement :', err.message);
  }
};



app.get('/send-relance-payer', (req, res) => {
  sendRelancePayer();
  res.json({ status: 'Relances paiement envoyées' });
});

app.get('/logout', async (req, res) => {
    try {
      await client.logout();
      qrCodeData = null;
      isClientReady = false;
      console.log('🔌 Déconnecté de WhatsApp');
      res.json({ status: 'Déconnecté de WhatsApp' });
    } catch (err) {
      console.error('❌ Erreur de déconnexion :', err.message);
      res.status(500).json({ error: 'Erreur de déconnexion' });
    }
});
app.get('/start-session', async (req, res) => {
    try {
      if (!client) return res.status(500).json({ error: "Client WhatsApp non initialisé" });
  
      await client.initialize();
      res.json({ status: "Session redémarrée" });
    } catch (error) {
      console.error("Erreur démarrage session WhatsApp:", error);
      res.status(500).json({ error: "Erreur lors du redémarrage de la session" });
    }
  });

  const PORT = process.env.PORT || 8080;
  app.listen(PORT, () => {
    console.log(`🚀 Serveur HTTP démarré sur http://localhost:${PORT}`);
  });

client.initialize();
