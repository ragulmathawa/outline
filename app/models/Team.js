// @flow
import { computed } from "mobx";
import BaseModel from "./BaseModel";

class Team extends BaseModel {
  id: string;
  name: string;
  avatarUrl: string;
  slackConnected: boolean;
  googleConnected: boolean;
  office365Connected: boolean;
  sharing: boolean;
  documentEmbeds: boolean;
  guestSignin: boolean;
  subdomain: ?string;
  url: string;

  @computed
  get signinMethods(): string {
    if (this.slackConnected && this.googleConnected) {
      return "Slack or Google";
    }
    if (this.office365Connected){
      return "Office 365"
    }
    if (this.slackConnected) return "Slack";
    return "Google";
  }
}

export default Team;
