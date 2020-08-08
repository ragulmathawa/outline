// @flow
import Sequelize from "sequelize";
import crypto from "crypto";
import Router from "koa-router";
import { capitalize } from "lodash";
import { Issuer, generators, Client } from "openid-client";
import { getCookieDomain } from "../utils/domains";
import { User, Team, Event } from "../models";
import auth from "../middlewares/authentication";
import type { Context } from "koa";
import fetch from "isomorphic-fetch";

const Op = Sequelize.Op;

const router = new Router();

var client: Client;
if (process.env.OFFICE365_ISSUER) {
  Issuer.discover(process.env.OFFICE365_ISSUER).then((issuer) => {
    client = new issuer.Client({
      client_id: process.env.OFFICE365_CLIENT_ID,
      client_secret: process.env.OFFICE365_CLIENT_SECRET,
      redirect_uris: [`${process.env.URL}/auth/office365.callback`],
      response_types: ['token', 'id_token']
    })
    console.log("Issuer found,client initialised", !!client);
  }).catch((err) => {
    console.error("failed to initialise Office365 Client",err);
    // $FlowFixMe
    process.exit(-1);
  });
}
const allowedDomainsEnv = process.env.OFFICE365_ALLOWED_DOMAINS;

// start the oauth process and redirect user to OIDC Authorization page
router.get("office365", async ctx => {
  let nonce = generators.nonce();
  // Generate the url for authorization page.
  const authorizeUrl = client.authorizationUrl({
    scope: "openid email profile User.Read",
    response_type: 'id_token token',
    response_mode: "form_post",
    nonce
  })
  ctx.cookies.set("office365Nonce", nonce, {
    httpOnly: true,
    domain: getCookieDomain(ctx.request.hostname),
  });
  ctx.redirect(authorizeUrl);
});

// signin callback from OIDC
router.post("office365.callback", auth({ required: false }), async ctx => {
  console.log(ctx.inspect());
  const params = client.callbackParams(ctx);
  console.log("Params", params);
  if(params.error){
    ctx.redirect("/?notice=auth-error&error=idp-respose");
    return;
  }
  try {
    let nonce = ctx.cookies.get("office365Nonce");
    if (!nonce) {
      ctx.redirect("/?notice=auth-error&error=nonce-error");
      return;
    }
    let tokenSet = await client.callback(`${process.env.URL}/auth/office365.callback`, params, { nonce })
    let profile = await client.userinfo(tokenSet);
    console.log("profile info", profile);
    debugger;
    let domain = profile.email.substring(profile.email.lastIndexOf('@') + 1);
    // allow all domains by default if the env is not set
    const allowedDomains = allowedDomainsEnv && allowedDomainsEnv.split(",");
    // Temporary workaround to check the allowed domain names
    if (allowedDomains && !allowedDomains.includes(domain)) {
      ctx.redirect("/?notice=hd-not-allowed");
      return;
    }

    const hostname = domain.split(".")[0];
    const teamName = capitalize(hostname);

    // attempt to get logo from Clearbit API. If one doesn't exist then
    // fall back to using tiley to generate a placeholder logo
    const hashedDomain = getHashed(domain);
    const cbUrl = `https://logo.clearbit.com/${domain}`;
    const tileyUrl = `https://tiley.herokuapp.com/avatar/${hashedDomain}/${
      teamName[0]
      }.png`;
    const cbResponse = await fetch(cbUrl);
    const avatarUrl = cbResponse.status === 200 ? cbUrl : tileyUrl;
    const [team, isFirstUser] = await Team.findOrCreate({
      where: {
        office365Id:domain,
      },
      defaults: {
        name: teamName,
        avatarUrl,
      },
    });
    // Currently, we need a authorized https url which s3.js can use to fetch. 
    // using tileyUrl as a workaround temporarily

    // let profilePicBuffer = await requestBuffer(profile.picture,tokenSet.access_token);
    // let profilePicBase64 = new Buffer.from(profilePicBuffer,'binary').toString('base64');
    // let profilePicture = `data:image/jpeg;${profilePicBase64}`;
    let profileHash = getHashed(profile.sub); 
    let profilePicture = `https://tiley.herokuapp.com/avatar/${profileHash}/${profile.name.substr(0,2)}.png`;
    try {
      const [user, isFirstSignin] = await User.findOrCreate({
        where: {
          [Op.or]: [
            {
              service: "office365",
              serviceId: profile.sub,
            },
            {
              service: { [Op.eq]: null },
              email: profile.email,
            },
          ],
          teamId: team.id,
        },
        defaults: {
          service: "office365",
          serviceId: profile.sub,
          name: profile.name,
          email: profile.email,
          isAdmin: isFirstUser,
          avatarUrl: profilePicture,
        },
      });

      // update the user with fresh details if they just accepted an invite
      if (!user.serviceId || !user.service) {
        await user.update({
          service: "office365",
          serviceId: profile.sub,
          avatarUrl: profilePicture,
        });
      }

      // update email address if it's changed
      if (!isFirstSignin && profile.email !== user.email) {
        await user.update({ email: profile.email });
      }
      
      if (isFirstUser) {
        await team.provisionFirstCollection(user.id);
        await team.provisionSubdomain(hostname);
      }

      if (isFirstSignin) {
        await Event.create({
          name: "users.create",
          actorId: user.id,
          userId: user.id,
          teamId: team.id,
          data: {
            name: user.name,
            service: "office365",
          },
          ip: ctx.request.ip,
        });
      }

      // set cookies on response and redirect to team subdomain
      ctx.signIn(user, team, "office365", isFirstSignin);
    } catch (err) {
      if (err instanceof Sequelize.UniqueConstraintError) {
        const exists = await User.findOne({
          where: {
            service: "email",
            email: profile.email,
            teamId: team.id,
          },
        });

        if (exists) {
          ctx.redirect(`${team.url}?notice=email-auth-required`);
        } else {
          ctx.redirect(`${team.url}?notice=auth-error`);
        }
        return;
      }
      throw err;
    }
  } catch (err) {
    throw err;
  }
});

function getHashed(value:string){
  const hash = crypto.createHash("sha256");
  hash.update(value);
  return hash.digest("hex");
}
async function requestBuffer(url: string,token: string) {
  let data;
  try {
    // $FlowFixMe
    const response = await fetch(
      url,
      {
        headers:{
          Authorization:"Bearer "+ token 
        }
      }
    );
    data = await response.buffer();
  } catch (err) {
    throw new Error(err.message);
  }
  return data;
}
export default router;
