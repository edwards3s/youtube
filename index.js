require("dotenv").config();
const Discord = require("discord.js");
const random = require("random");
const mongoose = require("mongoose");
const Profile = require("./src/databases/Profile.js");
const GuildConfig = require("./src/databases/GuildConfig");
const canvacord = require("canvacord");
const { Manager } = require("erela.js");

const client = new Discord.Client();
client.manager = new Manager({
  // Pass an array of node. Note: You do not need to pass any if you are using the default values (ones shown below).
  nodes: [
    // If you pass a object like so the "host" property is required
    {
      host: "localhost", // Optional if Lavalink is local
      port: 2333, // Optional if Lavalink is set to default
      password: "youshallnotpass", // Optional if Lavalink is set to default
    },
  ],
  // A send method to send data to the Discord WebSocket using your library.
  // Getting the shard for the guild and sending the data to the WebSocket.
  send(id, payload) {
    const guild = client.guilds.cache.get(id);
    if (guild) guild.shard.send(payload);
  },
})
  .on("nodeConnect", (node) =>
    console.log(`Node ${node.options.identifier} connected`)
  )
  .on("nodeError", (node, error) =>
    console.log(
      `Node ${node.options.identifier} had an error: ${error.message}`
    )
  )
  .on("trackStart", (player, track) => {
    client.channels.cache
      .get(player.textChannel)
      .send(`Now playing: ${track.title}`);
  })
  .on("queueEnd", (player) => {
    client.channels.cache.get(player.textChannel).send("Queue has ended.");

    player.destroy();
  });

mongoose.connect(process.env.MONGO, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});
client.on("ready", () => {
  console.log("I am ready ");
  client.manager.init(client.user.id);
});

client.on("message", async (message) => {
  if (message.author.bot) return;
  // let prefix;
  await GuildConfig.findOne(
    {
      guild: message.guild.id,
    },
    async (err, data) => {
      if (err) console.log(err);
      if (!data) {
        await GuildConfig.insertMany({
          guild: message.guild.id,
          prefix: "!",
        });
      }
      //  prefix = data.prefix;
    }
  );
  Profile.findOne(
    {
      guild: message.guild.id,
      userId: message.author.id,
    },
    async (err, data) => {
      if (!data) {
        Profile.insertMany({
          guild: message.guild.id,
          userId: message.author.id,
          level: 0,
          xp: 15,
          last_message: 60000,
          total_xp: 15,
        });
      } else {
        if (Date.now() - data.last_message > 60000) {
          let randomXP = random.int(15, 25);
          data.xp += randomXP;
          data.total_xp += randomXP;
          data.last_message = Date.now();
          const xpToNext = 5 * Math.pow(data.level, 2) + 5 * data.level + 100;
          if (data.xp >= xpToNext) {
            data.level++;
            data.xp = data.xp - xpToNext;
            message.channel.send(
              `Congrats ${message.author}, you leveld up to ${data.level}`
            );
          }
        }
        data.save().catch((err) => console.log(err));
      }
    }
  );
  const prefix = "!";
  const args = message.content.split(" ");
  let cmd = args.shift().slice(prefix.length).toLowerCase();
  if (!message.content.startsWith(prefix)) return;
  if (message.content === `${prefix}cmd`) {
    Profile.find({
      guild: message.guild.id,
    })
      .sort([["total_xp", "descending"]])
      .exec(async (err, res) => {
        if (err) return console.log(err);

        if (!res.length)
          return message.channel.send("Strange, no one has xp yet!");
        const user = message.mentions.users.first();
        if (!user) {
          for (let i = 0; i < res.length; i++) {
            if (res[i].userId != message.author.id) {
              if (i >= res.length - 1) {
                return;
              } else {
                continue;
              }
            } else {
              const xpToNext =
                5 * Math.pow(res[i].level, 2) + 5 * res[i].level + 100;
              const rankCard = new canvacord.Rank()
                .setAvatar(message.author.displayAvatarURL({ format: "png" }))
                .setRequiredXP(xpToNext)
                .setCurrentXP(res[i].xp)
                .setLevel(res[i].level)
                .setUsername(message.author.username)
                .setProgressBar("#FFF", "COLOR")

                .setDiscriminator(message.author.discriminator);
              rankCard.build().then((data) => {
                const attachment = new Discord.MessageAttachment(
                  data,
                  "rankcard.png"
                );
                message.channel.send(attachment);
              });
            }
          }
        } else {
          for (let i = 0; i < res.length; i++) {
            if (res[i].userId != user.id) {
              if (i >= res.length - 1) {
                return;
              } else {
                continue;
              }
            } else {
              const xpToNext =
                5 * Math.pow(res[i].level, 2) + 5 * res[i].level + 100;
              const rankCard = new canvacord.Rank()
                .setAvatar(user.displayAvatarURL({ format: "png" }))
                .setRequiredXP(xpToNext)
                .setCurrentXP(res[i].xp)
                .setLevel(res[i].level)
                .setUsername(user.username)
                .setProgressBar("#FFF", "COLOR")
                .setDiscriminator(user.discriminator);
              rankCard.build().then((data) => {
                const attachment = new Discord.MessageAttachment(
                  data,
                  "rankcard.png"
                );
                message.channel.send(attachment);
              });
            }
          }
        }
      });
  } else if (cmd === "play") {
    const { channel } = message.member.voice;

    if (!channel)
      return message.channel.send(
        "You need to join a voice channnel to play music"
      );
    if (!message.guild.me.hasPermission("SPEAK"))
      return message.channel.send(
        "I don't have the permission to speak in a voice channel!"
      );
    if (!message.guild.me.hasPermission("CONNECT"))
      return message.channel.send(
        "I don't have the permission to join a channel!"
      );
    if (!args)
      return message.channel.send("You have to tell me what you want to play");
    let searchArgs = args.join(" ");

    const search = await client.manager.search(searchArgs, message.author);

    let player = client.manager.players.get(message.guild.id);
    if (!player) {
      player = client.manager.create({
        guild: message.guild.id,
        voiceChannel: message.member.voice.channel.id,
        textChannel: message.channel.id,
      });
    }
    player.connect();

    switch (search.loadType) {
      case "NO_MATCHES":
        message.channel.send("Nothing was found with your query");

      case "TRACK_LOADED":
        await player.queue.add(search.tracks[0]);

        message.channel.send(`Enqueing ${search.tracks[0].title}`);
        if (!player.playing && !player.paused && !player.queue.size)
          player.play();

      case "PLAYLIST_LOADED":
        await player.queue.add(search.tracks);

        message.channel.send(`Enqueued ${search.tracks.length} tracks!`);

        if (
          !player.playing &&
          !player.paused &&
          player.queue.totalSize === search.tracks.length
        );
        player.play();
      case "SEARCH_RESULT":
        await player.queue.add(search.tracks[0]);
        await player.connect();
        message.channel.send(`Enqueing ${search.tracks[0].title}`);
        if (!player.playing && !player.paused && !player.queue.size)
          player.play();
    }
  } else if (cmd === "disconnect") {
    let player = client.manager.players.get(message.guild.id);
    if (!player) return message.channel.send("Nothing is playing");

    await player.destroy();
    message.channel.send("Disconnected!");
  } else if (cmd === "pause") {
    let player = client.manager.players.get(message.guild.id);
    if (!player) return message.channel.send("Nothing is playing");

    player.pause(true);
    message.channel.send("Paused!");
  } else if (cmd === "resume") {
    let player = client.manager.players.get(message.guild.id);
    if (!player) return message.channel.send("Nothing is playing");

    player.pause(false);
    message.channel.send("Resumed!");
  } else if (cmd === "skip") {
    let player = client.manager.players.get(message.guild.id);
    if (!player) return message.channel.send("Nothing is playing");

    await player.stop();
    message.channel.send("Skipped!");
  }
});
client.on("raw", (d) => client.manager.updateVoiceState(d));
client.login(process.env.TOKEN);
