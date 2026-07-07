# WhatsApp Docs (compact context)

Este arquivo é uma versão compacta de `docs/whatsapp.json` para ser usada como **contexto** em prompts.

Gerado em: 2025-12-24T12:27:59.917Z
Limite por seção: 1200 chars

Dica: se ainda ficar grande pro seu modelo, aumente a precisão pedindo pra IA citar o título/URL e reduza o limite via `WHATSAPP_CONTEXT_MAX_CHARS_PER_DOC`.

## About the WhatsApp Business Platform
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/about-the-platform/

* * *
Resources
# About the WhatsApp Business Platform
Updated: Dec 5, 2025
The WhatsApp Business Platform enables businesses to communicate with customers at scale.
This documentation is intended for developers using our APIs. If you are looking for information on other ways to use WhatsApp for your business see the [WhatsApp Business site](https://l.facebook.com/l.php?u=https%3A%2F%2Fbusiness.whatsapp.com%2F&h=AT2mOCJkTIbwNAk-WbkBf1Y1H9WaoCILEg2ORnjysL_w7-CPDEnS2-dLOPra4XL-yP0lLYYr6Q-s22zZqbsdvN0WKvz2Hzzkb3iuQPjPH9DQAvu05zFPlYo58KSrke6sOfU6VWdAaF-QQg).
## Core APIs and capabilities
### WhatsApp Cloud API
WhatsApp Cloud API enables you to programmatically message and call on WhatsApp. You can use Cloud API to send users a variety of messages, from simple text messages to rich media and interactive messages.
WhatsApp Cloud API includes:
**Messaging:** Send text messages, rich media, and interactive messages
**Calling:** Make and receive calls to customers
**Groups:** Create, manage, and message WhatsApp group conversations
WhatsApp messaging provides a powerful and private way to engage with customers. Use Cloud API to:
Send order confirmations and shipping updates
Share appointmen

## Access tokens
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/access-tokens/

* * *
Resources
# Access tokens
Updated: Nov 20, 2025
The platform supports the following access token types. The type you use depends on who will be using your application, and whether or not you are a [solution provider](https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/overview).
If you are a **direct developer**, meaning only you or your business will be accessing your own data, use a [System User access token](https://developers.facebook.com/documentation/business-messaging/whatsapp/access-tokens/#system-user-access-tokens).
If you are a **Tech Provider**, use a [Business Integration System User access token](https://developers.facebook.com/documentation/business-messaging/whatsapp/access-tokens/#business-integration-system-user-access-tokens).
If you are a **Solution Partner**, use [System User access tokens](https://developers.facebook.com/documentation/business-messaging/whatsapp/access-tokens/#system-user-access-tokens) to share your line of credit with newly onboarded customers, and [Business Integration System User access tokens](https://developers.facebook.com/documentation/business-messaging/whatsapp/access-tokens/#business-in

## Analytics
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/analytics/

* * *
Resources
# Analytics
Updated: Dec 12, 2025
Starting December 1, 2025, the maximum lookback window for messaging, conversation, and pricing analytics is changing from 10 years to 1 year. The lookback window for template and template group analytics will be unaffected and will continue to be 90 days.
This document describes how to get messaging, conversation, and template analytics, such as the number of messages sent from a business phone number, the number of conversations and their costs for a WhatsApp Business Account (WABA), or the number of times a given template has been read.
Only metrics for business phone numbers and templates associated with your WABA at the time of the request will be included in responses.
## Get data
Use the [GET /<WHATSAPP\_BUSINESS\_ACCOUNT\_ID>](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-account/whatsapp-business-account-api#Reading) endpoint to get analytics.
### Request syntax
```
curl -g 'https://graph.facebook.com/<API_VERSION>/<WHATSAPP_BUSINESS_ACCOUNT_ID>?fields=<FIELD>.<FILTERS>' \
-H 'Authorization: Bearer <ACCESS_TOKEN>'
```
### Request parameters
| Placeholder | Description

## ## This page isn't available right now
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/block-users/

## This page isn't available right now
This may be because of a technical error that we're working to get fixed. Try reloading this page.
Reload Page

## ## This page isn't available right now
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/business-phone-numbers/conversational-components/

## This page isn't available right now
This may be because of a technical error that we're working to get fixed. Try reloading this page.
Reload Page

## Media
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/business-phone-numbers/media/

* * *
Resources
# Media
Updated: Dec 11, 2025
Incoming media messages webhooks ( [image messages](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages/image), [video messages](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages/video), etc.) now include the media download URL (assigned to the `url` property) which you can query directly with your access token to download the incoming message’s media asset.
You use 4 different endpoints to manage your media:
| Endpoint | Uses |
| --- | --- |
| [`POST /PHONE_NUMBER_ID/media`](https://developers.facebook.com/documentation/business-messaging/whatsapp/business-phone-numbers/media/#upload-media) | Upload media. |
| [`GET /MEDIA_ID`](https://developers.facebook.com/documentation/business-messaging/whatsapp/business-phone-numbers/media/#get-media-url) | Retrieve the URL for a specific media. |
| [`DELETE /MEDIA_ID`](https://developers.facebook.com/documentation/business-messaging/whatsapp/business-phone-numbers/media/#delete-media) | Delete a specific media. |
| [`GET /MEDIA_URL`](https://developers.facebook.com/documentation/business-messagi

## Business phone numbers
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/business-phone-numbers/phone-numbers/

* * *
Resources
# Business phone numbers
Updated: Dec 12, 2025
This document describes WhatsApp business phone numbers, their requirements, management information, and unique features.
## Registering business phone numbers
A valid business phone number must be registered before it can be used to send and receive messages via Cloud API. Registered numbers can still be used for everyday purposes, such as calling and text messages, but cannot be used with WhatsApp Messenger (“WhatsApp”).
Numbers already in use with WhatsApp cannot be registered unless they are [deleted](https://l.facebook.com/l.php?u=https%3A%2F%2Ffaq.whatsapp.com%2F2138577903196467%2F%3Fhelpref%3Duf_share&h=AT0qzXejQpqOQNSRm5M5YyQgd0Q-eXM2F2Yv7uiT1vuApMj6ExefPG0SQk5A-IINrRpTsyVncCyRm4gwW1YZ-9nRIy1DC7WTvM7VBRxT8t3QpMZzB8HIgMYg-vdTajxh_sub-7uzzAxuHg) first. If your number is banned on WhatsApp and you wish to register it, it must be unbanned via the [appeal process](https://l.facebook.com/l.php?u=https%3A%2F%2Ffaq.whatsapp.com%2F465883178708358&h=AT0qzXejQpqOQNSRm5M5YyQgd0Q-eXM2F2Yv7uiT1vuApMj6ExefPG0SQk5A-IINrRpTsyVncCyRm4gwW1YZ-9nRIy1DC7WTvM7VBRxT8t3QpMZzB8HIgMYg-vdTajxh_sub-7uzzAxuHg) first.
Note that when you compl

## ## This page isn't available right now
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/business-phone-numbers/registration/

## This page isn't available right now
This may be because of a technical error that we're working to get fixed. Try reloading this page.
Reload Page

## Two-Step Verification
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/business-phone-numbers/two-step-verification/

* * *
Resources
# Two-Step Verification
Updated: Nov 5, 2025
You are required to set up two-step verification for your phone number, as this provides an extra layer of security to the business accounts. To set it up, make a `POST` call to `/PHONE_NUMBER_ID` and attach the parameters below. There is no endpoint to disable two-step verification.
| Endpoint | Authentication |
| --- | --- |
| `/PHONE_NUMBER_ID`<br>(See [Get Phone Number ID](https://developers.facebook.com/documentation/business-messaging/whatsapp/business-phone-numbers/phone-numbers#get-all-phone-numbers)) | Solution Partners must authenticate themselves with an access token with the `whatsapp_business_management` and `whatsapp_business_messaging` permissions. |
### Parameters
| Name | Description |
| --- | --- |
| `pin` | **Required.**<br>A 6-digit PIN you wish to use for two-step verification. |
### Example
Sample request:
```
curl -X  POST \
'https://graph.facebook.com/v24.0/FROM_PHONE_NUMBER_ID' \
-H 'Authorization: Bearer ACCESS_TOKEN' \
-H 'Content-Type: application/json' \
-d '{"pin" : "6_DIGIT_PIN"}'
```
Sample response:
```
{
"success": true
}
```
All API calls require authentication with access tokens.
Develo

## Business profiles
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/business-profiles/

* * *
Resources
# Business profiles
Updated: Oct 5, 2025
Your business phone number’s business profile provides additional information about your business, such as its address, website, description, etc. You can supply this information when registering your business phone number, or later, via WhatsApp Manager or API.
![](https://scontent-mia3-1.xx.fbcdn.net/v/t39.2365-6/507476070_1379105613180336_7510619276605653298_n.png?_nc_cat=106&ccb=1-7&_nc_sid=e280be&_nc_ohc=_KaYCYHlUFUQ7kNvwGnHphW&_nc_oc=AdlS7neWNWxaQc5GOuNbP4KppzYkfml32dPFF1198ORtznkhk3NGZ6dYnaxg_6X-ExQ&_nc_zt=14&_nc_ht=scontent-mia3-1.xx&_nc_gid=085lS0Mp-nXkMk1xpIHnBg&oh=00_AflLYecCuA7aLsqDby6yesIk89y3aLGO7phSIcFFkluRrw&oe=696504DD)
## Viewing or updating your profile via WhatsApp Manager
To view or update your business profile via WhatsApp Manager:
Navigate to [WhatsApp Manager](https://business.facebook.com/latest/whatsapp_manager/) \> **Account tools** \> **Phone numbers**.
Select your business phone number.
Click the **Profile** tab to view your current profile.
Use the form to set new profile values.
## Getting your profile via API
Use the [GET /<WHATSAPP\_BUSINESS\_PHONE\_NUMBER\_ID>/whatsapp\_business\_profile](htt

## Business-scoped user IDs
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/business-scoped-user-ids/

* * *
Resources
# Business-scoped user IDs
Updated: Nov 21, 2025
WhatsApp is launching usernames later in 2026.
Usernames are an optional feature for users and businesses. If a username is adopted by a WhatsApp user, their username will be displayed instead of their phone number in the app. Business usernames are not intended for privacy, however. If you adopt a business username, it will not cause your business phone number to be hidden in the app.
To support usernames, we will share a new backend user identifier called business-scoped user ID, or BSUID. BSUID uniquely identifies a WA user and is tied to a specific business.
This document describes how the addition of usernames will impact API requests, API responses, and webhook payloads. Additional changes to support usernames before the feature is made available will be recorded here.
**Any changes described in this document are subject to change.**
## User usernames
A user username is a unique, optional name that WhatsApp users can set in order to display their username instead of their phone number in the app. Usernames can be used in lieu of profile names when personalizing message content for individual users.
WhatsApp user

## Cloud API Calling
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/calling/

* * *
Resources
# Cloud API Calling
Updated: Dec 10, 2025
## Overview
The WhatsApp Business Calling API enables you to initiate and receive calls with users on WhatsApp using Voice over Internet Protocol (VoIP).
### Architecture
![Image](https://scontent-mia5-2.xx.fbcdn.net/v/t39.2365-6/564723412_1339317954593522_7943224529857744756_n.jpg?_nc_cat=100&ccb=1-7&_nc_sid=e280be&_nc_ohc=tDQrD_3121oQ7kNvwHeQvD0&_nc_oc=AdmhlcJRCKxOk1hWgfh20ZkmJb-rBb-kebqX0kuWACKp1nXJfs0EfNWYh58HfB59KkQ&_nc_zt=14&_nc_ht=scontent-mia5-2.xx&_nc_gid=RXRBGkFTkhxDsr9BDMNQ5w&oh=00_Afn2MmBwPV862i84sw-EGPqD3Hw3_2N6YlR4ogafy6s1Zw&oe=69650505)
## Get started
### Step 1: Prerequisites
Before you get started with the Calling API, ensure that:
[Your business number is in use with Cloud API](https://developers.facebook.com/documentation/business-messaging/whatsapp/business-phone-numbers/phone-numbers) (not the WhatsApp Business app)
Subscribe your app to the `calls` webhook field (unless you plan to use [SIP](https://developers.facebook.com/documentation/business-messaging/whatsapp/calling/sip))
The same app should also be [subscribed to the WhatsApp Business Account](https://developers.facebook.com/documentation/busines

## Calling API App Review Guidelines
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/calling/app-review-guidelines/

* * *
Resources
# Calling API App Review Guidelines
Updated: Nov 21, 2025
## Overview
The official page referenced by our reviewers is [/docs/permissions#w](https://developers.facebook.com/docs/permissions#w). Use this guide as complimentary to that page but treat that page as the authentic source when in doubt.
This page describes more details to increase your chances of a successful App Review specifically for WhatsApp Business Calling API features.
## Guidelines
### For the WhatsApp Business Management permission
You should clearly show that your application can enable and disable calling features by displaying whether the Call Button icon is visible.
Share a video of you enabling and disabling the Call Button icon for the WhatsApp business either via CURL request, or via settings within your application UI.
Do this by _actually_ enabling and disabling calling features, not simply toggling Call Button icon visibility.
#### Example
Display a chat thread between your business and a WhatsApp user that does not have the Call Button icon.
Use your developer app to enable Calling API features on the business phone number, which will enable the Call Button icon for a given business pho

## Business-initiated calls
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/calling/business-initiated-calls/

* * *
Resources
# Business-initiated calls
Updated: Nov 13, 2025
## Overview
The Calling API supports making calls to WhatsApp users from your business.
The user dictates when calls can be received by [granting call permissions to the business phone number](https://developers.facebook.com/documentation/business-messaging/whatsapp/calling/user-call-permissions).
### Call sequence diagram
![Image](https://scontent-mia5-1.xx.fbcdn.net/v/t39.2365-6/561795972_1339317917926859_882777793042649890_n.jpg?_nc_cat=104&ccb=1-7&_nc_sid=e280be&_nc_ohc=ARvei27XupgQ7kNvwEz3qXL&_nc_oc=Adm8cDn9d5HT7Pz270id_vxxVyBAmfAWuxvJOESWvyYAghkrOZgUKhaCnLUBY5jh83k&_nc_zt=14&_nc_ht=scontent-mia5-1.xx&_nc_gid=bqxgRDdP89deyjUEtV-WaQ&oh=00_Afmvrh9DTJwdWXjIkbFGNJCP7YGTiYwIjyJd9gXPQdSpdw&oe=6964ED8D)
_Note: The `ACCEPTED` call status webhook will typically always arrive after the call has been established. It is primarily sent for call event auditing._
## Prerequisites
Before you get started with business-initiated calling, ensure that:
[Subscribe](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/create-webhook-endpoint#configure-webhooks) to the “calls” webhook field
Lastly, **befor

## Call Button Messages and Deep Links
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/calling/call-button-messages-deep-links/

* * *
Resources
# Call Button Messages and Deep Links
Updated: Nov 14, 2025
## Overview
After you adopt Cloud API Calling features, you can raise awareness with your customers in two core ways:
Send them a message with a WhatsApp call button
Embed a calling deep link into your brand surfaces (website, application, etc)
## Send interactive message with a WhatsApp Call Button
Use this endpoint to send a free form interactive message with a WhatsApp call button during a [customer service window](https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/send-messages#customer-service-windows) or an [open conversation window](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing#opening-conversations).
When a WhatsApp user clicks the call button, it initiates a WhatsApp call to the business number that sent the message.
A standard [message status webhook](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages/status) will be sent in response to this message send.
![Image](https://scontent-mia3-2.xx.fbcdn.net/v/t39.2365-6/561384673_1339318434593474_5721045063886655968_n.jpg?_nc_cat=105&ccb

## Configure Call Settings
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/calling/call-settings/

* * *
Resources
# Configure Call Settings
Updated: Dec 10, 2025
**Calling is not enabled by default on a business phone number**
Use the `POST /<PHONE_NUMBER_ID>/settings` endpoint to enable Calling API features on a business phone number.
**Calling Eligibility**
To qualify for Calling API features, your business must have a messaging limit of at least 2000 business-initiated conversations in a rolling 24-hour period.
When you test your WhatsApp Calling integration using public test numbers (PTNs) and sandbox accounts, Calling API restrictions are relaxed.
## Overview
Use these endpoints to view and configure call settings for the WhatsApp Business Calling API.
You can also [configure session initiation protocol (SIP)](https://developers.facebook.com/documentation/business-messaging/whatsapp/calling/sip) for call signaling instead of using Graph API endpoint calls and webhooks.
## Configure/Update business phone number calling settings
Use this endpoint to update call settings configuration for an individual business phone number.
**WhatsApp clients reflecting latest calling config**
After call configuration is updated, WhatsApp users may take up to 7 days to reflect that configura

## FAQs
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/calling/faq/

* * *
Resources
# FAQs
Updated: Nov 13, 2025
## Product FAQ
**Will calls show up in the insights page on Meta WhatsApp Manager UI?**
Call insights will be available in both WhatsApp Manager and the [analytics API](https://developers.facebook.com/documentation/business-messaging/whatsapp/analytics).
**Are International calls supported like WhatsApp consumer to consumer calls?**
Yes
#### What are the countries supported for calling?
User-initiated Calling (UIC) is available in [every location Cloud API is available](https://developers.facebook.com/documentation/business-messaging/whatsapp/support#country-restrictions)
Business-initiated Calling (BIC) is currently available in [every location Cloud API is available](https://developers.facebook.com/documentation/business-messaging/whatsapp/support#country-restrictions), **except the following countries:**
USA
Canada
Turkey
Egypt
Vietnam
Nigeria
**Note:** The business phone number’s country code must be in this supported list. The consumer phone number can be from any [country where Cloud API is available.](https://developers.facebook.com/documentation/business-messaging/whatsapp/support#country-restrictions)
**Can I use toll-free numbe

## Integration Examples
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/calling/integration-examples/

* * *
Resources
# Integration Examples
Updated: Dec 11, 2025
This guide explains integration of common VoIP platforms with WhatsApp Business Calling API.
This guide is for information purposes only with no support or warranties of any kind from Meta or any vendor. There are many ways to integrate and the guide explains just one way exclusively for illustrative purposes.
## Asterisk using SIP
### Overview
This guide explains how to set up [WhatsApp Business Calling API](https://developers.facebook.com/documentation/business-messaging/whatsapp/calling) using SIP signaling with [Asterisk](https://l.facebook.com/l.php?u=https%3A%2F%2Fwww.asterisk.org%2F&h=AT1zTgW8OcxkDLlWsgSfuAX5Mz--1ZtZY2D1TLlFz_KesU9a3hgGVFB9tO1KoFBC0kK-sJmNiQrFgRwqi3OYESqzdXGeXE4YEIAp4CeOE2cTfW2BTY7wQMi_5fEPoSjBTrpweZEm6LzoGQ), an open-source PBX (Private Branch Exchange). You’ll learn how to configure your Asterisk server, connect SIP phones, and handle both incoming and outgoing WhatsApp calls.
#### User-Initiated Calls
The WhatsApp user dials the business number.
The call is received by Asterisk and routed through an IVR, prompting the user to enter an extension, registered to the same Asterisk server.
The call i

## ## This page isn't available right now
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/calling/integration-patterns/

## This page isn't available right now
This may be because of a technical error that we're working to get fixed. Try reloading this page.
Reload Page

## Calling API Pricing
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/calling/pricing/

* * *
Resources
# Calling API Pricing
Updated: Dec 11, 2025
**All user-initiated calls are free.**
## Overview
Business-initiated calls are charged based on:
Duration of the call (calculated in six-second pulses)
Country code of the phone number being called.
Volume tier (based on minutes called within the calendar month)
Note: Our systems count fractional pulses as one pulse. For example, a 56-second call (9.33 pulses) would be counted as 10 pulses.
For calls that cross pricing tiers (e.g. from the 0 - 50,000 tier to the 50,001 - 250,000 tier), the entire call is priced at the lower rate (i.e. the rate of the higher volume tier).
A valid payment method is required to place calls.
**Note:** Call permission request messages are subject to [per-messaging pricing](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing).
## Volume-Based Pricing (VBP) rate cards
These rate cards represent the current VBP rates for the WhatsApp Business Calling API effective August 1, 2025:
## How calling changes the 24 hour customer service window
Available since October 1, 2024
Currently, when a WhatsApp user messages you, a [24-hour timer called a customer service window](ht

## API and Webhook Reference
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/calling/reference/

* * *
Resources
# API and Webhook Reference
Updated: Nov 25, 2025
## Calling API Endpoints
### Configure/Update calling settings
Call the Update Phone Number Settings endpoint and pass in Calling API specific parameters to configure or update Calling API settings on an individual business phone number you designate in the request syntax.
#### Request syntax
```
POST /<PHONE_NUMBER_ID>/settings
```
#### Endpoint parameters
| Placeholder | Description | Sample Value |
| --- | --- | --- |
| `<PHONE_NUMBER_ID>`<br>_Integer_ | **Required**<br>The business phone number for which you are updating Calling API settings. | `+12784358810` |
#### Request body
```
{
"calling": {
"status": "ENABLED",
"call_icon_visibility": "DEFAULT",
"call_hours": {
"status": "ENABLED",
"timezone_id": "America/Manaus",
"weekly_operating_hours": [\
{\
"day_of_week": "MONDAY",\
"open_time": "0400",\
"close_time": "1020"\
},\
{\
"day_of_week": "TUESDAY",\
"open_time": "0108",\
"close_time": "1020"\
}\
],
"holiday_schedule": [\
{\
"date": "2026-01-01",\
"start_time": "0000",\
"end_time": "2359"\
}\
]
},
"callback_permission_status": "ENABLED",
"sip": {
"status": "ENABLED | DISABLED (default)",
"servers": [\
{\
"hos

## ## This page isn't available right now
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/calling/sandbox/

## This page isn't available right now
This may be because of a technical error that we're working to get fixed. Try reloading this page.
Reload Page

## Session Initiation Protocol (SIP)
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/calling/sip/

* * *
Resources
# Session Initiation Protocol (SIP)
Updated: Dec 15, 2025
When SIP is enabled, you **cannot use calling related Graph API endpoints** and **calling related webhooks are not sent**.
## Overview
Session Initiation Protocol ( [SIP](https://l.facebook.com/l.php?u=https%3A%2F%2Fdatatracker.ietf.org%2Fdoc%2Fhtml%2Frfc3261&h=AT1S_XUsZhort1_ljY8-8uUyzDSRkJDHJy98U3GwLN9FC8TYdtBlOH6AWVaWWFCx5o6-q_fxjW19UXNqAuRpd1THQZCjEQN5ES15AJOt2KzC9N83Hf9xK-MJ5wGqtwL_lDGMaqCXWa4vQw)) is a signaling protocol used for initiating, maintaining, modifying, and terminating real-time communication sessions between two or more endpoints.
WhatsApp Business Calling API supports use of SIP as the signaling protocol instead of our Graph API endpoints and Webhooks.
### Before you get started
Before you get started with SIP call signaling, confirm the following:
You meet overall [calling pre-requisites](https://developers.facebook.com/documentation/business-messaging/whatsapp/calling#step-1--prerequisites)
Your app has messaging permissions for the business phone number you want to enable SIP for.
Test this by sending and receiving messages using Graph API messaging endpoints, then use the same app to c

## Troubleshooting and Error Codes
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/calling/troubleshooting/

* * *
Resources
# Troubleshooting and Error Codes
Updated: Dec 3, 2025
## Standard error response
When you receive an error, In the majority of cases the error shape will look like this:
```
{
"error": {
"message": "<Error Message>",
"type": "<Exception Type>",
"code": <Exception Code>,
"fbtrace_id": "<Trace ID>"
}
```
Use the Calling API error codes list below to identify and resolve calling errors.
## Calling logs
The **Call Logs** tab in [WhatsApp Manager](https://business.facebook.com/latest/whatsapp_manager/phone_numbers) provides businesses and partners with a detailed, self-service view of call events to aid in call troubleshooting.
The tab displays a table of recent call logs for your business phone numbers. Each call has a log, and each log can have multiple events which represent a Graph API request made by the business, or a webhook sent by Meta to the business. Each row represents a call, with different columns highlighted to provide information about each call log.
### How to view call logs
Navigate to to [WhatsApp Manager > Account tools > Phone numbers](https://business.facebook.com/latest/whatsapp_manager/phone_numbers)
Select the desired phone number to view the ca

## Obtain User Call Permissions
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/calling/user-call-permissions/

* * *
Resources
# Obtain User Call Permissions
Updated: Nov 13, 2025
As of November 3, 2025, permanent permissions is now available. Users can now grant a business ongoing permission to call. Users can review and change calling permission for a business at any time in the business profile.
Call permission related features are available only in regions where [business initiated calling is available](https://developers.facebook.com/documentation/business-messaging/whatsapp/calling#availability).
## Overview
If you want to place a call to a WhatsApp user, your business must receive user permission first. When a WhatsApp user grants call permissions, they can be either temporary or permanent.
Business does not have control over this permission as it is only granted by the user and can only be revoked by the user, at any time. Permanent permission data will be stored until it is revoked.
You can obtain calling permission from a WhatsApp user in any of the following ways:
**Send a call permission request to the user** — Send a free-form or templated message requesting calling permission from the user. User has the option to choose between temporary or permanent.
**Callback permission is

## User-initiated calls
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/calling/user-initiated-calls/

* * *
Resources
# User-initiated calls
Updated: Nov 13, 2025
## Overview
The Calling API supports receiving calls made by WhatsApp users to your business.
Your business dictates when calls can be received by [configuring business calling hours and holiday unavailability](https://developers.facebook.com/documentation/business-messaging/whatsapp/calling/call-settings#parameter-details).
**Consumer device eligibility**
Currently, the WhatsApp Business Calling API can only accept calls that originate from a consumer’s primary device. Calls originating from a consumer’s companion devices will be rejected.
A **primary device** is the consumer’s main device, typically a mobile phone, which holds the authoritative state for the user’s account. It has full access to messaging history and core functionalities. There is exactly one primary device per user account at any given time.
**Companion devices** are additional devices registered to the user’s account that can operate alongside the primary device. Examples include web clients, desktop apps, tablets, and smart glasses. Companion devices have access to some or all messaging history and core features but are limited compared to the primar

## ## This page isn't available right now
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/calling/video-calling/

## This page isn't available right now
This may be because of a technical error that we're working to get fixed. Try reloading this page.
Reload Page
* * *

## Sell Products & Services
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/catalogs/sell-products-and-services/

* * *
Resources
# Sell Products & Services
Updated: Nov 4, 2025
Businesses using the WhatsApp Business API can showcase and share their products and services with customers for them to browse items and add to a cart without leaving the chat. To use the API for commerce use cases, follow these guides:
[**Upload inventory to Meta**](https://developers.facebook.com/documentation/business-messaging/whatsapp/catalogs/sell-products-and-services/upload-inventory): Upload the business’s inventory to Meta using the API or the [Meta Commerce Manager](https://business.facebook.com/commerce/).
[**Connect an Ecommerce Catalog to the WABA**](https://www.facebook.com/business/help/158662536425974): Connect a catalog that has been categorized as **Ecommerce** to the WhatsApp Business Account.
[**Set Commerce Settings**](https://developers.facebook.com/documentation/business-messaging/whatsapp/catalogs/sell-products-and-services/set-commerce-settings): Set the business phone number’s commerce settings.
[**Share Products With Customers**](https://developers.facebook.com/documentation/business-messaging/whatsapp/catalogs/sell-products-and-services/share-products): Use Multi and Single Product Message

## Receive responses from customers
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/catalogs/sell-products-and-services/receive-responses/

* * *
Resources
# Receive responses from customers
Updated: Oct 22, 2025
After receiving single- or multi-product messages, WhatsApp users can ask for more information about a product or place an order. These actions are communicated via [messages](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages) webhook.
## Sent message status
Sent message statuses (sent, delivered, read) are described in [status messages webhooks](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages/status).
## Asking for information
Whenever a WhatsApp user receives a single- or multi-product message, they can ask for more information by sending you a text message in an existing WhatsApp thread, or by tapping a **Message business** or **Message** button when viewing a specific product.
Messages sent after tapping a **Message business** or **Message** button are described in [text messages webhooks](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages/text) and a `context` property will be included, whose value is an object describing the product the user was view

## Set Commerce Settings
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/catalogs/sell-products-and-services/set-commerce-settings/

* * *
Resources
# Set Commerce Settings
Updated: Nov 14, 2025
You can enable or disable the shopping cart and the product catalog on a per-business phone number basis. By default, the shopping cart is enabled and the storefront icon is hidden for all business phone numbers associated with a WhatsApp Business Account.
## Requirements
A [system token](https://developers.facebook.com/documentation/business-messaging/whatsapp/access-tokens#system-user-access-tokens) or [user token](https://developers.facebook.com/documentation/business-messaging/whatsapp/access-tokens#user-access-tokens).
The [whatsapp\_business\_management](https://developers.facebook.com/docs/permissions/reference/whatsapp_business_management) permission.
If using a [system token](https://developers.facebook.com/documentation/business-messaging/whatsapp/access-tokens#system-user-access-tokens), the system user must be granted full controll over the WhatsApp Business Account.
Businesses based in India must [comply with all online selling laws](https://www.facebook.com/help/1104628230079278).
## Get Business Phone Numbers
Use the [WhatsApp Business Account > Phone Numbers](https://developers.facebook.com/documentation/

## Share products with WhatsApp users
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/catalogs/sell-products-and-services/share-products/

* * *
Resources
# Share products with WhatsApp users
Updated: Nov 6, 2025
You have multiple ways to share products with your customers.
## Catalog messages
Catalog messages are messages that allow you to showcase your product catalog entirely within WhatsApp.
Catalog messages display a product thumbnail header image of your choice, custom body text, a fixed text header, a fixed text sub-header, and a **View catalog** button.
![](https://scontent-mia3-3.xx.fbcdn.net/v/t39.2365-6/353831413_931793014769642_1489938023342123500_n.png?_nc_cat=109&ccb=1-7&_nc_sid=e280be&_nc_ohc=gCWdb-XelTIQ7kNvwGtbBHu&_nc_oc=Adn58Qi7AFQNS8rBl2r30w-LLXcEEBQJYt_PaLk4QyPBrkljEF9FEYs7yzYyYsl2UoU&_nc_zt=14&_nc_ht=scontent-mia3-3.xx&_nc_gid=YX1Xfp3EMFMp66HM7WvGog&oh=00_AfkOskOJRqJR1JZQ1oPwXGxzCdUL4aS6cZLsVZR_kdiIvg&oe=6964E455)
When a customer taps the **View catalog** button, your product catalog appears within WhatsApp.
![](https://scontent-mia3-3.xx.fbcdn.net/v/t39.2365-6/353808079_9331603410246288_3629219693038191737_n.png?_nc_cat=109&ccb=1-7&_nc_sid=e280be&_nc_ohc=nGNjxmCM_NsQ7kNvwHkvCv1&_nc_oc=Adk8_RzRXFCcpgXOnkNyC2_aDeann68SlTRfbWtjZF35e4Hr9ckpUBX6Z7-YMt_waOE&_nc_zt=14&_nc_ht=scontent-mia3-3.xx&_nc_gid=Y

## Upload Inventory to Meta
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/catalogs/sell-products-and-services/upload-inventory/

* * *
Resources
# Upload Inventory to Meta
Updated: Oct 22, 2025
A business’s inventory needs to be uploaded to Meta in a catalog format — see [About Catalogs](https://www.facebook.com/business/help/890714097648074) for more information.
If a business already has a Meta catalog set up, we suggest that you leverage that catalog for WhatsApp commerce use cases. Just [connect the catalog to a WhatsApp Business Account](https://www.facebook.com/business/help/158662536425974) (WABA) and the business will be able to [share products with customers](https://developers.facebook.com/documentation/business-messaging/whatsapp/catalogs/sell-products-and-services/share-products).
If a business needs to create a catalog, there are two possibilities:
Create a catalog using the [Commerce API](https://developers.facebook.com/docs/commerce-platform/catalog/get-started)
Create a catalog using the [Meta Commerce Manager](https://business.facebook.com/commerce/).
You can only upload one catalog per WABA, but the same catalog can belong to multiple phone numbers.
## Solution Partners
Solution Partners onboarding client businesses into commerce messages have the following options:
If a client business alr

## WhatsApp Business Platform
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/changelog/

* * *
Resources
Changelog
* * *
Changelog (0)
Search changelog
* * *

## Welcome Message Sequences
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/ctwa/welcome-message-sequences/

* * *
Resources
# Welcome Message Sequences
Updated: Nov 17, 2025
When creating ads that Click-to-WhatsApp, you can connect a Welcome Message Sequence from a messaging partner app. A sequence can include text, prefilled message, and FAQs.
This guide explains how to manage Welcome Message Sequences via the API endpoint.
## Requirements
Your app must be granted the **whatsapp\_business\_management** permission.
## Endpoints
```
// Create a new sequence / Change an existing sequence
POST /<WHATSAPP_BUSINESS_ACCOUNT_ID>/welcome_message_sequences
```
// Get a list of sequences / Get a specific sequence
GET /<WHATSAPP_BUSINESS_ACCOUNT_ID>/welcome_message_sequences
```
// Delete a sequence
DELETE /<WHATSAPP_BUSINESS_ACCOUNT_ID>/welcome_message_sequences
```
## Create a Sequence
To upload a new welcome message sequence, send a `POST` request to the `WHATSAPP_BUSINESS_ACCOUNT_ID/welcome_message_sequences` endpoint.
### Endpoint
```
// Create a new sequence
POST /<WHATSAPP_BUSINESS_ACCOUNT_ID>/welcome_message_sequences
```
### Sample Request
```
curl -X POST\
-F 'welcome_message_sequence=
{
"text":"This is a welcome message authored in a 3P tool",
"autofill_message": {"content": "Hello! Can

## Data Privacy & Security
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/data-privacy-and-security/

* * *
Resources
# Data Privacy & Security
Updated: Oct 29, 2025
This page describes how Meta provides Cloud API as a standalone service for businesses to message users at scale via WhatsApp. Meta also offers additional optional services that businesses can choose to use with Cloud API. For example, a business can leverage Meta’s AI capabilities to converse with customers via Cloud API. When a business chooses to use these services, different terms could apply. Please consult the applicable documentation for additional details on how Meta processes data for these services.
## Message Flows
When a user sends a message to a business that uses Cloud API, the message travels encrypted via WhatsApp between the user and Cloud API. Once the message is received by Cloud API, Cloud API decrypts the message and forwards it to the business. When a business uses Cloud API to send a message to a user, the reverse applies. Upon receiving a message from a business, Cloud API will encrypt the message using the Signal protocol before sending it to the user via WhatsApp. Per the Signal protocol, the user and Cloud API, acting on behalf of the business, negotiate encryption keys and establish a secure

## Display names
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/display-names/

* * *
Resources
# Display names
Updated: Dec 12, 2025
You must provide a display name when [registering](https://developers.facebook.com/documentation/business-messaging/whatsapp/business-phone-numbers/registration) a business phone number. The display name appears in your business phone number’s WhatsApp profile:
![](https://scontent-mia3-3.xx.fbcdn.net/v/t39.2365-6/507127951_698062976515521_2852142619234157074_n.png?_nc_cat=110&ccb=1-7&_nc_sid=e280be&_nc_ohc=rMfm0Rkr7vwQ7kNvwGt0tzM&_nc_oc=AdnKKi2cZQZYv0QH5hLzKTN8fdpCDiqYReKyVnUx1-_Rc5EgV31j76bxU9IAx3Jwlhs&_nc_zt=14&_nc_ht=scontent-mia3-3.xx&_nc_gid=dw7P8F3EL949Bn5cC82NPg&oh=00_AfmpbH6Z8HwhXvEvZ1anMG2JSq3KMzefnDYmMsb2uPQD1w&oe=6964FDE9)
It can also appear at the top of **individual chat** threads and the **chat list** if your business phone number is approved via [display name verification](https://developers.facebook.com/documentation/business-messaging/whatsapp/display-names/#display-name-verification). Note that if a WhatsApp user edits your profile name in the WhatsApp client, the name they set will appear instead.
## Display name guidelines
See our [Display name guidelines for the WhatsApp Business Platform](https://www.faceb

## App-Only Install
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/app-only-install/

* * *
Resources
# App-Only Install
Updated: Nov 4, 2025
You can configure Embedded Signup so that only [business tokens](https://developers.facebook.com/documentation/business-messaging/whatsapp/access-tokens#business-integration-system-user-access-tokens) can be used to access assets owned by customers onboarded via the flow. This approach offers enhanced security by reducing risk associated with [system tokens](https://developers.facebook.com/documentation/business-messaging/whatsapp/access-tokens#system-user-access-tokens), flexibility in simplifying onboarding for other Meta assets, and scalability to support a larger number of onboardings. By using a granular token, you can also reduce the negative impact in case of a compromised token, making it a more secure and efficient way to manage your business customer assets.
Note that App-Only Install can’t be used to [onboard WhatsApp Business app users](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users).
## Enabling the feature in Embedded Signup v3
To enable this feature, set `features` to `app_only_install` in the Embedded Signup configuration.
```
{
"config_id

## Automatic Events API
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/automatic-events-api/

* * *
Resources
# Automatic Events API
Updated: Nov 18, 2025
Business customers who access Embedded Signup are given the option to opt-in to automatic event identification:
![](https://scontent-mia3-1.xx.fbcdn.net/v/t39.2365-6/503425036_1029531339304862_7305936950282438326_n.png?_nc_cat=106&ccb=1-7&_nc_sid=e280be&_nc_ohc=HBBXpflyxKMQ7kNvwGkDvfc&_nc_oc=AdlITmHmWaTE9YpL95JsX8jCbwFs5NDhz_KoRdnI5mNbuAKvaDzDvv26IxT9ClW3aac&_nc_zt=14&_nc_ht=scontent-mia3-1.xx&_nc_gid=fddn1ObnHO2zBPfweHWemg&oh=00_AfnIlbcYyaskXMldIk6UJE-29EyA3DjNhhuD214l26giIQ&oe=6965004D)
If a business customer opts-in, we use a combination of regex and natural language processing to analyze the customer’s new message threads that originate from a Click-to-WhatsApp ad. If our analysis determines that a lead gen or purchase event has occurred, you can be notified of the determination by subscribing to the [automatic\_events](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/automatic_events) webhook field. You can then report the event for the customer using the [Conversions API](https://developers.facebook.com/docs/marketing-api/conversions-api) so that it can be leveraged by the

## Bypassing the phone number addition screen
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/bypass-phone-addition/

* * *
Resources
# Bypassing the phone number addition screen
Updated: Nov 14, 2025
This document describes how to customize Embedded Signup to bypass the [phone number addition screen](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/default-flow#phone-number-addition-screen) (shown below) and [phone number verification screen](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/default-flow#phone-number-verification-screen).
![](https://scontent-mia3-2.xx.fbcdn.net/v/t39.2365-6/464076811_858112679765152_5952854678961541773_n.png?_nc_cat=107&ccb=1-7&_nc_sid=e280be&_nc_ohc=4AGHbQiLEt8Q7kNvwHssg07&_nc_oc=AdkrV4dk37zQz8xBmcL49uw8A1AyU9Z1w8FY4W6JzhQHTtacHtdC5cMVRwszgTLN_ko&_nc_zt=14&_nc_ht=scontent-mia3-2.xx&_nc_gid=gD3j9VL3mIyeHMEQ_gjpFA&oh=00_Afnk9r8s8qO23WFYpsOdTRpU7iYOhy5wl4BWmAFL6p_r9Q&oe=6964DF4E)
If you don’t want your business customers to have to enter or choose a business phone number in the phone number addition screen, you can customize Embedded Signup to skip the screen entirely. However, after a customer successfully completes the customized flow, you must [programmatically create and register

## Customizing the default flow
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/custom-flows/

* * *
Resources
# Customizing the default flow
Updated: Nov 14, 2025
This document provides an overview of the various ways that you can customize Embedded Signup’s default flow to present different versions of the flow to your business customers.
## Onboarding WhatsApp Business app users (aka “Coexistence”)
You can configure Embedded Signup to [allow business customers to onboard using their existing WhatsApp Business app account and phone number](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users):
![](https://scontent-mia3-3.xx.fbcdn.net/v/t39.2365-6/477341352_1809983926468415_3794578338113490554_n.png?_nc_cat=108&ccb=1-7&_nc_sid=e280be&_nc_ohc=glhQaxsHdUkQ7kNvwFKZbVY&_nc_oc=Adl07jPRhTZcqJMI27AENBOUqbDTzgD2gyKqx7SNowasbEWUwb-1rauGecavJonFPrc&_nc_zt=14&_nc_ht=scontent-mia3-3.xx&_nc_gid=0bjKWTbQPUX-n945loihUw&oh=00_Afm5FkpnjsPAxyOSt-BQRj5vIRbbznksRL2mdbdYnYaiJQ&oe=6964EA5B)
Businesses who are successfully onboarded after choosing this option will then be able to use your app to message their customers at scale, but still have the ability to send messages on a one-to-one basis using the WhatsApp Business app.
## P

## Cloud API flow
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/default-flow/

* * *
Resources
# Cloud API flow
Updated: Nov 11, 2025
This document describes the default screens that your business customers will be presented with as they navigate the Embedded Signup flow. Note that if you inject [pre-filled data](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/pre-filled-data), you can pre-fill some of these screens, and bypass many of them entirely, reducing the likelihood of errors and making it much easier for your business customers to onboard onto the platform. This is the UI flow for the latest version v4.
## Screens
### Authentication screen
This screen authenticates business customers using their Facebook or Meta Business Suite credentials.
![](https://scontent-mia5-1.xx.fbcdn.net/v/t39.2365-6/530819633_636229419515187_227138492125594706_n.png?_nc_cat=104&ccb=1-7&_nc_sid=e280be&_nc_ohc=zgqLlrJ-FrcQ7kNvwGMgu8L&_nc_oc=Adlt7zYjzuVgFbW--istz3p1Bh0sqabCmtxglNJ87cKrv2lVDcGiCmQgNyIwLi4DIvU&_nc_zt=14&_nc_ht=scontent-mia5-1.xx&_nc_gid=SpJrFTcXlKf9_18N_daSaA&oh=00_AfmJeqfaLoE8YGm94n078Hxlcvoxx7fEVNV36zVKxHBvCA&oe=6964E114)
### Authorization screen
This screen describes the data the business customer will be permitting y

## Embedded Signup Flow Errors
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/errors/

* * *
Resources
# Embedded Signup Flow Errors
Updated: Nov 10, 2025
This guide helps you get acquainted with the different errors that may arise as you [embed the signup flow](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/implementation) in your website or client portal.
## Abandoned Flow Screens
If a business customer prematurely abandons the Embedded Signup flow, we will send a [message event](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/implementation#session-logging-message-event-listener) to the browser that spawned the flow, that indicates which screen the customer was viewing when they abandoned the flow.
The `data.current_step` property value indicates which screen the customer abandoned:
```
{
data: {
current_step: "<CURRENT_STEP>",
},
type: "WA_EMBEDDED_SIGNUP",
event: "CANCEL",
version: 3
}
```
| Current step value | Corresponding screen |
| --- | --- |
| `<BUSINESS_ACCOUNT_SELECTION>` | [Business portfolio screen](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/default-flow#business-portfolio-screen) |
| `<WABA_PHONE_PROFILE_PICKER>` | [WABA

## Hosted Embedded Signup
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/hosted-es/

* * *
Resources
# Hosted Embedded Signup
Updated: Nov 4, 2025
If you don’t want to implement Embedded Signup by adding JavaScript code to your website or customer portal, you can instead use a link that, when clicked, displays a web page describing onboarding steps, and a button that launches the Embedded Signup flow:
![](https://scontent-mia3-2.xx.fbcdn.net/v/t39.2365-6/557247008_1487309905743315_2332288243528054136_n.png?_nc_cat=105&ccb=1-7&_nc_sid=e280be&_nc_ohc=DbtP8Z-erTwQ7kNvwGjQj99&_nc_oc=AdlCfgjkaXSdaVWYXQJ7ap5TW6GbOIIxIYm5FaLkWwNUcDOLFOi_Rp-NMSSeC5LHX2A&_nc_zt=14&_nc_ht=scontent-mia3-2.xx&_nc_gid=rpA1dvRbcswPL6eWY82Diw&oh=00_Aflkp08IJ0xUw2269xYH-Qz9oJCR5xvSqxTEnxDE0Z-F2A&oe=6964D90A)
## Limitations
Hosted Embedded Signup (“Hosted ES”) can only be used to onboard business customers to Cloud API, and the flow cannot be customized.
## Requirements
You must have completed the steps to become a Solution Partner or Tech Provider.
If your app is for messaging, it must be able to send messages, manage templates, and have a properly configured production webhook endpoint.
Your app must be subscribed to the [account\_update](https://developers.facebook.com/documentation/business-mes

## Implementation
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/implementation/

* * *
Resources
# Implementation
Updated: Nov 4, 2025
This document explains how to implement Embedded Signup v4 and capture the data it generates to [onboard business customers](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/implementation/#onboarding-business-customers) onto the WhatsApp Business Platform.
## Before you start
You must already be a [Solution Partner](https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/get-started-for-solution-partners) or [Tech Provider](https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/get-started-for-tech-providers).
If your business customers will be using your app to send and receive messages, you should already know how to use the API to send and receive messages using your own WhatsApp Business Account and business phone numbers. You should also know how to create and manage templates and have a webhooks callback endpoint properly set up to digest webhooks.
You must be subscribed to the [account\_update](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/account_update) webho

## Onboarding WhatsApp Business app users (aka "Coexistence")
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users/

* * *
Resources
# Onboarding WhatsApp Business app users (aka "Coexistence")
Updated: Dec 12, 2025
You can configure Embedded Signup to allow business customers to onboard using their existing [WhatsApp Business app](https://l.facebook.com/l.php?u=https%3A%2F%2Fbusiness.whatsapp.com%2Fproducts%2Fbusiness-app&h=AT1kuN_kWnMFeE8j6wXHKf5KcIauhVhjOiWTsIsSDtp7LQkKswJOq2bkk9iWly7C7R9jsLtMiCP1uan8a4dCefpul6nfXf7Ihzo2TSo5m6xAlV8m4SxmSoWu2fuuH4UJkb5-9mKQET3-hg) account and phone number. Customers who are successfully onboarded after choosing this option will then be able to use your app to message their customers at scale, but still have the ability to send messages on a one-to-one basis using the WhatsApp Business app, while keeping messaging history between both apps in sync.
## How it works
When you configure Embedded Signup for WhatsApp Business app phone numbers, a business customer who goes through the flow will be given the option to connect their existing WhatsApp Business app account to Cloud API:
![](https://scontent-mia5-1.xx.fbcdn.net/v/t39.2365-6/594963134_868478475878739_1087736207670610686_n.png?_nc_cat=104&ccb=1-7&_nc_sid=e280be&_nc_ohc=QFkfqZEAzs4Q7kNvwFd8oKi&_nc_oc=Adn9SG-H

## Onboarding business customers as a Solution Partner
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-customers-as-a-solution-partner/

* * *
Resources
# Onboarding business customers as a Solution Partner
Updated: Nov 14, 2025
This document describes the steps Solution Partners must perform to onboard new business customers who have completed the Embedded Signup flow.
If you are a Solution Partner, any business customer who completes your implementation of the Embedded Signup flow will not be able to use your app to access their WhatsApp assets or send and receive messages until you complete these steps.
## What you will need
the business customer’s WABA ID (returned via [session logging](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/implementation#session-logging-message-event-listener) or [API request](https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/manage-accounts#get-shared-waba-id-with-access-token))
the business customer’s business phone number ID (returned via [session logging](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/implementation#session-logging-message-event-listener) or [API request](https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-p

## Onboarding business customers as a Tech Provider or Tech Partner
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-customers-as-a-tech-provider/

* * *
Resources
# Onboarding business customers as a Tech Provider or Tech Partner
Updated: Nov 14, 2025
This document describes the steps Tech Providers and Tech Partners must perform to onboard new business customers who have completed the Embedded Signup flow.
If you are a Tech Provider or Tech Partner, any business customer who completes your implementation of the Embedded Signup flow will not be able to use your app to access their WhatsApp assets or send and receive messages (if you are offering messaging services) until you complete these steps.
## What you will need
the business customer’s WABA ID (returned via [session logging](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/implementation#session-logging-message-event-listener) or [API request](https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/manage-accounts#get-shared-waba-id-with-access-token))
the business customer’s business phone number ID (returned via [session logging](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/implementation#session-logging-message-event-listener) or [API request](ht

## Embedded Signup
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/overview/

* * *
Resources
# Embedded Signup
Updated: Nov 25, 2025
Embedded Signup is an authentication and authorization desktop- and mobile-compatible interface that makes it easy for your business customers to generate the assets you will need to successfully onboard them to the WhatsApp Business Platform.
The Embedded Signup flow gathers business-related information from your business customers, automatically generates all WhatsApp assets needed by the platform, and grants your app access to these assets, so you can quickly provide your business customers with WhatsApp messaging services.
## How it works
Embedded Signup leverages the Facebook Login for Business product and our JavaScript SDK. Once configured, you can add a link or button to your website or portal that launches the flow.
Business customers who click the link or button will be presented with a new window where they can:
authenticate their identity using their Facebook or Meta Business Credentials
accept terms of service for Cloud API, WhatsApp Business, Meta, Marketing Messages Lite API and Meta Business Tool Terms
select multiple WhatsApp APIs and accept terms of service
grant your app access to their WhatsApp assets
selec

## Pre-filling screens
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/pre-filled-data/

* * *
Resources
# Pre-filling screens
Updated: Nov 10, 2025
If you know details about your customer’s business, such as its name and address, you can inject this data into Embedded Signup. This can pre-fill screens or bypass them altogether, dramatically reducing the amount of input and interaction required by your customers.
For example, here is the business portfolio screen, pre-filled with business’s name, email address, website, country, and a pre-verified business phone number:
![](https://scontent-mia5-2.xx.fbcdn.net/v/t39.2365-6/465727373_1573223883300812_8312998736298536563_n.png?_nc_cat=100&ccb=1-7&_nc_sid=e280be&_nc_ohc=gL7ffpTNTYoQ7kNvwFmGtwS&_nc_oc=AdlJPq_6ZmnBaCYe0Ulg1cv5CAyaF8rjLDX1UqWORhQtvssD2CfUDrvyNNfjQg6BTYM&_nc_zt=14&_nc_ht=scontent-mia5-2.xx&_nc_gid=uuEWnAolCNAk7kjZhW9cVg&oh=00_AfmWBapA-W1uAFX4wHnNq75LIbPQGnA_-7YDdBT3v68PVA&oe=6964E887)
We recommend that you inject [business portfolio data](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/pre-filled-data/#business-portfolio-data), a [pre-verified number](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/pre-filled-data/#pre-verifie

## ## This page isn't available right now
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/pre-verified-numbers/

## This page isn't available right now
This may be because of a technical error that we're working to get fixed. Try reloading this page.
Reload Page

## ## This page isn't available right now
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/version-2-public-preview/

## This page isn't available right now
This may be because of a technical error that we're working to get fixed. Try reloading this page.
Reload Page

## Version 3 Public Preview
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/version-3-public-preview/

* * *
Resources
# Version 3 Public Preview
Updated: Nov 4, 2025
We are updating the UI for Embedded Signup. You can get a preview of what it looks like by enabling v3-public-preview. The new version will give partners a preview on what’s to come for Embedded Signup in the near future. Functionality between v3-public-preview and v3 are identical; the key difference is a simplified UI on v3-public-preview.
### Authentication screen
This screen authenticates business customers using their Facebook or Meta Business Suite credentials.
![](https://scontent-mia5-1.xx.fbcdn.net/v/t39.2365-6/530819633_636229419515187_227138492125594706_n.png?_nc_cat=104&ccb=1-7&_nc_sid=e280be&_nc_ohc=zgqLlrJ-FrcQ7kNvwFmsXg2&_nc_oc=AdltR8FLa4j5hE51BMy12Pp5f_5v1BDtIB-cPmkr_buAkWmGqqARXHJTIgf4g87v5EU&_nc_zt=14&_nc_ht=scontent-mia5-1.xx&_nc_gid=qpg5nE_Mt7B2XlRtoUTMiA&oh=00_AflyduPLi5EnCyJsSemTdbESM1UuwN5OF7jkdyQ34I-TGQ&oe=6964E114)
### Authorization screen
This screen describes the data the business customer will be permitting your app to access.
![](https://scontent-mia3-2.xx.fbcdn.net/v/t39.2365-6/531995822_1112262264200439_63249353490863536_n.png?_nc_cat=105&ccb=1-7&_nc_sid=e280be&_nc_ohc=rJSn_AaSnv4Q7kNvwE8

## Version 3
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/version-3/

* * *
Resources
# Version 3
Updated: Dec 11, 2025
We are introducing versioning cadence to Embedded Signup that will align with Graph API. Version 3 will be released on May 29th for all partners to adopt, which will include the following changes.
## Business customers can now complete the flow without a phone number
Previously in v2, you would always be required to register a verified phone number (unless partners enabled the bypass phone numbers flow) to complete the flow. You can now complete the flow with statuses like verified, unverified, or no phone number at all.
You can either go through Embedded Signup again, go on WhatsApp manager, or the partner can utilize [API calls to verify the number](https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/registering-phone-numbers).
To determine the status of the phone number, visit the documentation on session info logging.
## Session Info Logging is automatically enabled
All partners who are on v3 will have session info logging enabled automatically. Partners will still have to add an event listener on the same window of Embedded Signup to process the incoming information.
## Adding the `featu

## Version 4
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/version-4/

* * *
Resources
# Version 4
Updated: Dec 12, 2025
Release date: October 8, 2025. Check back soon for updates on additional supported products.
To upgrade to the version 4 experience: You need to create a new [Facebook Login for Business Configuration](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/version-4#using-the-facebook-login-for-business-configuration-to-get-started-with-v4), and select your desired products. Selecting the products will automatically set you to v4.
See screenshots below.
## Overview of v4 changes
Simplified onboarding experience for businesses:
You can onboard businesses to more business messaging in a single flow ( [see supported products](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/version-4#supported-products)).
Asset selection, business information, and permissions are each consolidated onto a single page.
Asset admins can share assets from other business portfolios.
Phone numbers are auto-linked to Facebook Pages when onboarding to ads that click to WhatsApp via the Marketing API.
Value proposition and Terms of Service are clearly presented.
The [Facebook Login for

## Versions
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/versions/

* * *
Resources
# Versions
Updated: Dec 11, 2025
The latest Embedded Signup Version is: `v4`
This guide provides an overview on versioning in Embedded Signup. The versioning cadence will align with Graph API. The versions are not
exclusive, partners can gradually roll out a new version of ES to reduce risk. The Embedded Signup version is determined inside of the **extras object** of the implementation code.
**Note: The refreshed UI, currently available in the public preview, will be rolled out to all versions of Embedded Signup in early September.**
## Available ES Versions
| Version | Date Introduced | Available Until |
| --- | --- | --- |
| [v4](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/version-4) | October 8th, 2025 | TBD |
| [v3-public-preview](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/version-3-public-preview) | August 14, 2025 | October, 2026 |
| [v2-public-preview](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/version-2-public-preview) | August 14, 2025 | October, 2026 |
| [v3.0](https://developers.facebook.com/documentation/business-mes

## Website field optional
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/website-optional/

* * *
Resources
# Website field optional
Updated: Nov 4, 2025
This feature is currently only available to approved **Select Solution** and **Premier** Solution Partners. See our [Sign up for partner-led business verification](https://www.facebook.com/business/help/1091073752691122) Help Center article to learn how to request approval.
By default, the website field is required in the [business portfolio screen](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/default-flow#business-portfolio-screen). If you have been approved for [Partner-led Business Verification](https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/partner-led-business-verification) however, the website field will become optional and will be accompanied by a **My business does not have a website or profile page** checkbox:
![](https://scontent-mia3-3.xx.fbcdn.net/v/t39.2365-6/467331606_2133248890410157_3569145607260288812_n.png?_nc_cat=109&ccb=1-7&_nc_sid=e280be&_nc_ohc=WmcVbh__xGYQ7kNvwGV6sRM&_nc_oc=AdmDRmoaUs4QBvM0rn3bLvNRrjbdo4EyPiStBETyvahiueLMN52NwFc-T6IPSTmpA1Q&_nc_zt=14&_nc_ht=scontent-mia3-3.xx&_nc_gid=PTUX7qwyr40RZ5uGLtLSOw&oh

## ## This page isn't available right now
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/encryption/

## This page isn't available right now
This may be because of a technical error that we're working to get fixed. Try reloading this page.
Reload Page
* * *

## WhatsApp Cloud API Get Started
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/get-started/

* * *
Resources
# WhatsApp Cloud API Get Started
Updated: Oct 1, 2025
This guide helps developers quickly get started with the WhatsApp Cloud API. It covers the basic setup steps, including registering as a developer, creating a Meta app, sending your first message, and setting up a test webhook endpoint. You’ll also learn how to generate secure access tokens and send both template and non-template messages. Advanced features and further resources are introduced for deeper exploration.
* * *
## Download the Sample App
The Jasper’s Market sample app contains all of the messages and code used in the Jasper’s Market demo. You can use this sample app to learn how to build an application that sends and handles WhatsApp Cloud API data.
* * *
## Prerequisites
You must have a Facebook account or a managed Meta account.
You must be registered as a developer.
If you have not registered as a developer, navigate to [https://developers.facebook.com/async/registration/](https://developers.facebook.com/async/registration/) and follow the prompts.
You need access to a device with WhatsApp on it so you can send and receive test messages during setup.
* * *
## Step 1. Create a New Meta Developer App

## Get opt-in for WhatsApp
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/getting-opt-in/

* * *
Resources
# Get opt-in for WhatsApp
Updated: Nov 3, 2025
Businesses are required to obtain opt-in before messaging people on WhatsApp.
As per the November 2024 [WhatsApp Business Messaging Policy](https://l.facebook.com/l.php?u=https%3A%2F%2Fbusiness.whatsapp.com%2Fpolicy&h=AT0DAEG5dODMA92Ho3foaSJqBFiCqdNMJWaPG0owUgcHlNhIbCuVR1Ie1KTt-HgZm6ewdxOnP2n6Svu0Zfmhpc-ew1gmlAZv23IQHQKSu9Nw1wvlrpmi_QkT9BeZ7rgfxRZGnp_rJXdFSg) update, before messaging people on WhatsApp, businesses are required to obtain opt-in permission, which can be general and not specifically for WhatsApp, as long as businesses comply with all local laws. Businesses may contact people on WhatsApp if: (a) they have given their mobile phone number; and (b) businesses have received opt-in permission from the recipient confirming that they wish to receive subsequent messages or calls from a particular business.
## Requirements
Businesses must follow the below requirements when obtaining opt-in:
Businesses must clearly state that a person is opting in to receive communication from the business
Businesses must clearly state the business’s name that a person is opting in to receive messages from
Businesses must comply with

## Groups API
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/groups/

* * *
Resources
# Groups API
Updated: Nov 14, 2025
The Groups API enables you to programmatically create groups for messaging and collaboration.
## How it works
Groups are an invite-only experience where participants join using a group invite link you send them. This invite link provides context about the group, helping the user decide whether they want to join.
![](https://scontent-mia3-1.xx.fbcdn.net/v/t39.2365-6/583332263_2097826120969757_476207660850437421_n.png?_nc_cat=111&ccb=1-7&_nc_sid=e280be&_nc_ohc=7iUNMCvjRi8Q7kNvwH2ENc2&_nc_oc=Adkt2q2DXaAEuwk8pwEWO-sq_h5XmYxJnHGr_hI2T52uL0hmj_ehnbMvsa1fKbU5-8c&_nc_zt=14&_nc_ht=scontent-mia3-1.xx&_nc_gid=FQYzj84shA-jl6hSpCiA5w&oh=00_AflJf3tI_m0G5YoGc6uTDx0WoSl5ktgdB3osjx583xYUoQ&oe=6964F87B)
## Get Started
When you are ready to start using the Groups API, head on over to our “Get Started” guide for more information:
## Quick Facts
**Max group participants:** 8
**Supported message types:** Text, media, text-based templates, and media-based templates
**Max groups you can create:** 10,000 per business number
**Max Cloud API businesses per group:** 1
## Analytics
**Performance metrics are not available for message templates used in Groups.**

## Groups API Error Codes and Troubleshooting
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/groups/error-codes/

* * *
Resources
# Groups API Error Codes and Troubleshooting
Updated: Oct 31, 2025
## Error Codes
| Code | Description | HTTP Status Code |
| --- | --- | --- |
| `131020`<br>Bad Group | Cannot send messages to single member groups. | `400`<br>Bad Request |
| `131041`<br>Group unknown | The group was not found, either because it doesn’t exist or you are not a member. | `400`<br>Bad Request |
| `131059`<br>Invalid cursor | The cursor has either expired or become corrupted. Start pagination from the beginning again. | `400`<br>Bad Request |
| `131201`<br>Request partially succeeded | Not all participant-level operations in the request succeeded. | `206`<br>Partial Content Success |
| `131202`<br>Duplicate participant | Duplicate participants in the participant array input. | `400`<br>Bad Request |
| `131204`<br>Participant overlimit | Group participant size exceeds limit. | `400`<br>Bad Request |
| `131207`<br>Group suspended | The group violates platform policies. | `403`<br>Forbidden |
| `131208`<br>Group Rate Limit Hit | Group operation failed because there were too many group operations from this phone number in a short period. | `429`<br>Too many requests |
| `131209`<br>Invalid

## Groups API FAQ
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/groups/faq/

* * *
Resources
# Groups API FAQ
Updated: Oct 22, 2025
### What happens when I delete a group?
No members, including you, will be able to message the group.
If any messages or statuses were received by Cloud API before the group was deleted, you may still receive webhooks for those.
### Why can’t a participant join the group using my invite link?
Some possible reasons include:
The invite link may have been deleted.
You may have removed the participant from the group previously.
The group may already be full.
### How can I send my invite link to users?
You can send the invite link over a 1:1 conversation.
A new utility template is available in the [Template Library](https://business.facebook.com/wa/manage/template-library) to [send group invite links](https://developers.facebook.com/documentation/business-messaging/whatsapp/groups/reference#send-group-invite-link-template-message).
You may also create custom, free-form marketing templates.
### What countries is Groups available in?
Groups is available in [all countries Cloud API is available in](https://developers.facebook.com/documentation/business-messaging/whatsapp/support#country-restrictions).
Did you find this page helpful?
![

## Get started with Groups API
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/groups/get-started/

* * *
Resources
# Get started with Groups API
Updated: Nov 14, 2025
**Eligibility for Groups API**
To qualify for groups features, your business must meet the following requirement:
Have a messaging limit of at least 100,000 business-initiated conversations in a rolling 24-hour period
Be an [Official Business Account (OBA)](https://developers.facebook.com/documentation/business-messaging/whatsapp/official-business-accounts)
## Overview
Groups on are invite-only, meaning that potential group participants are ultimately in control of wether they want to join the group or not.
When you create a group, a unique invite link that is generated which you can share to potential group participants. This link includes information about the group, enabling users to make an informed decision about wether or not they want to join the group.
Once a user joins the group, a webhook is triggered, signaling that you are now eligible to send messages to the group.
For a complete overview of available features, see the [Groups API Features](https://developers.facebook.com/documentation/business-messaging/whatsapp/groups/get-started#features) below.
## How to start using groups
### Prerequisites
Before

## Group messaging
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/groups/groups-messaging/

* * *
Resources
# Group messaging
Updated: Nov 14, 2025
## Overview
This document provides comprehensive information on the APIs and webhooks available for sending and receiving messages within groups. It details support for various message types, including:
Text messages
Media messages
Text-based templates
Media-based templates
## Subscribe to groups metadata webhooks
In order to receive webhook notifications for metadata about your groups, please subscribe to the following webhook fields:
`group_lifecycle_update`
`group_participants_update`
`group_settings_update`
`group_status_update`
For a full reference of webhooks for the Groups API, please visit our [Webhooks for Groups API reference](https://developers.facebook.com/documentation/business-messaging/whatsapp/groups/webhooks).
## Send group message
To send a group message, use the existing send message endpoint:
`POST /<BUSINESS_PHONE_NUMBER_ID>/messages`
This endpoint has been extended to support group messages in the following way:
The `recipient_type` field now supports `group` as well as `individual`.
The `to` field now supports the `group ID` that is obtained when using the Groups API.
### Example group message send
```
c

## Groups API Pricing
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/groups/pricing/

* * *
Resources
# Groups API Pricing
Updated: Oct 22, 2025
## Per-message pricing on Groups API
Groups API uses Cloud API’s [per-message pricing model](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing#per-message-pricing) to determine if a given message is billable. However, **you are charged each time a billable message is delivered to someone in the group.**
For example, if you send a (billable) marketing template message to a group with 5 WhatsApp users and it is delivered to all 5 users, you would be charged for 5 delivered messages at the going marketing message rate for each recipient’s country calling code.
If the message was delivered to only 4 of the 5 users, you would only be charged for the 4 delivered messages.
## How customer service windows work with Groups API
Customer service windows work differently when using Groups API.
When any WhatsApp user in the group messages you, a [customer service window](https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/send-messages#customer-service-windows) is opened between you and the entire group (or is refreshed, if one already exists). This allows you to send utilit

## Group management
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/groups/reference/

* * *
Resources
# Group management
Updated: Nov 14, 2025
## Overview
The Groups API gives you simple functions to control groups through their lifecycle.
When you create a new group, an invite link is created for inviting participants to the group.
Since you cannot manually add participants to the group, simply send a message with your invite link to WhatsApp users who you would like to join the group.
## Group management features
To learn how to message groups, view the [Group Messaging reference](https://developers.facebook.com/documentation/business-messaging/whatsapp/groups/groups-messaging).
## Subscribe to groups metadata webhooks
In order to receive webhook notifications for metadata about your groups, please subscribe to the following webhook fields:
`group_lifecycle_update`
`group_participants_update`
`group_settings_update`
`group_status_update`
For a full reference of webhooks for the Groups API, please visit our [Webhooks for Groups API reference](https://developers.facebook.com/documentation/business-messaging/whatsapp/groups/webhooks).
## Create group
Use this endpoint to create a new group and generate a group invite link.
Once the group is created, you will receive

## Webhooks for Groups API
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/groups/webhooks/

* * *
Resources
# Webhooks for Groups API
Updated: Oct 22, 2025
In order to receive webhook notifications for metadata about your groups, please subscribe to the following webhook fields:
`group_lifecycle_update`
`group_participants_update`
`group_settings_update`
`group_status_update`
## `group_lifecycle_update` webhooks
A `group_lifecycle_update` webhook is triggered when a group is either created or deleted.
### Group create succeed
```
{
"object": "whatsapp_business_account",
"entry": [\
{\
"id": "WHATSAPP_ACCOUNT_ID",\
"changes": [\
{\
"value": {\
"messaging_product": "whatsapp",\
"metadata": {\
"display_phone_number": "DISPLAY_PHONE_NUMBER",\
"phone_number_id": "PHONE_NUMBER_ID"\
},\
"groups": [\
{\
"timestamp": "TIMESTAMP",\
"group_id": "GROUP_ID",\
"type": "group_create",\
"request_id": "REQUEST_ID",\
"subject": "test invite link",\
"invite_link": "https://chat.whatsapp.com/LINK_ID"\
"join_approval_mode": "JOIN_APPROVAL_MODE"\
}\
]\
},\
"field": "group_lifecycle_update"\
}\
]\
}\
]
}
```
### Group create fail
```
{
"object": "whatsapp_business_account",
"entry": [\
{\
"id": "WHATSAPP_ACCOUNT_ID",\
"changes": [\
{\
"value": {\
"messaging_product": "whatsapp",\
"metadata": {\

## ## This page isn't available right now
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/identity-change/

## This page isn't available right now
This may be because of a technical error that we're working to get fixed. Try reloading this page.
Reload Page

## Link Previews
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/link-previews/

* * *
Resources
# Link Previews
Updated: Nov 5, 2025
WhatsApp supports link previews when the link is sent via chat or shared via status. WhatsApp will attempt to perform a link preview when possible for a better user experience. To enable this experience, WhatsApp relies on link owners to define properties that are specifically optimized for WhatsApp. Not meeting these requirements may risk the link to be not previewed.
![](https://scontent-mia3-1.xx.fbcdn.net/v/t39.2365-6/316961531_1509723012881470_8719776711697314858_n.png?_nc_cat=106&ccb=1-7&_nc_sid=e280be&_nc_ohc=44kFWSBSNQcQ7kNvwGEv0CP&_nc_oc=AdlANT6Iok8G7hlOTemoSAy3eKhcB2__ZxIDuDK0LjUNZJFJgVRgi9hAlNPK60ZFe0o&_nc_zt=14&_nc_ht=scontent-mia3-1.xx&_nc_gid=2C25FwUi42nRmWrpycJ3Tw&oh=00_AfnuwroHmAK7bOozP5-FgTXO6D7gyLDEoYS-xxH9hKmuDg&oe=6964EE64)
![](https://scontent-mia3-3.xx.fbcdn.net/v/t39.2365-6/316956074_903853424360664_8885274580316527555_n.png?_nc_cat=109&ccb=1-7&_nc_sid=e280be&_nc_ohc=PtPh6gMfrCUQ7kNvwH9MQze&_nc_oc=Adlc3VWRt_JklIOXwqDvdupjtwRjvVaUoqTplHVrfZkejYRu3Bxh0KkAISp8EOQ4mQw&_nc_zt=14&_nc_ht=scontent-mia3-3.xx&_nc_gid=2C25FwUi42nRmWrpycJ3Tw&oh=00_AfkDf3Cndhwb2o9oVuC4Px--SGlltRW1RXoZUS-LP5CKjQ&oe=6964D22F)
## Get Start

## Local Storage
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/local-storage/

* * *
Resources
# Local Storage
Updated: Dec 12, 2025
Local storage offers an additional layer of data management control, by giving you the option to specify where your message data is stored at rest. If your company is in a regulated industry such as finance, government, or healthcare, you may prefer to have your message data stored in a specific country when at rest because of regulatory or company policies.
## How local storage works
Local storage is controlled by a setting enabled or disabled at a WhatsApp business phone number level. Both Cloud API and MM Lite API support local storage, and the setting will apply to any messages sent via either API if enabled.
When Local storage is enabled, the following constraints are applied to message content for a business phone number:
**Data-in-use:** When message content is sent or received by Cloud API or MM Lite API, message content may be stored on Meta data centers internationally while being processed.
**Data-at-rest:**After the data-in-use period, message content is deleted from Meta data centers outside of the specified local storage region, and persisted only in data centers within the local storage region selected. Note that

## Changelog
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/marketing-messages/changelog/

* * *
Resources
# Changelog
Updated: Dec 10, 2025
## December 18, 2025
_Marketing Messages API for WhatsApp_
Businesses that use Marketing Messages API for WhatsApp can now view [metrics for quick replies](https://developers.facebook.com/documentation/business-messaging/whatsapp/marketing-messages/view-metrics).
## November 19, 2025
_Marketing Messages API for WhatsApp_
[Marketing Messages API for WhatsApp](https://developers.facebook.com/documentation/business-messaging/whatsapp/marketing-messages/overview) (formerly known as Marketing Messages Lite API) is now generally available.
## October 31, 2025
_MM Lite API_
Added two new [Automatic Creative Optimization types](https://developers.facebook.com/docs/whatsapp/marketing-messages-lite-api/sending-messages#product-extensions): product extensions and text formatting optimization.
Launched a new endpoint to support [WABA-level opt-out](https://developers.facebook.com/docs/whatsapp/marketing-messages-lite-api/sending-messages#configure-automatic-creative-optimizations--whatsapp-business-account-level-) for automatic creative optimizations.
## October 20, 2025
_MM Lite API_
[Offsite conversion metrics](https://developers.facebook.com

## ## This page isn't available right now
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/marketing-messages/deep-links/

## This page isn't available right now
This may be because of a technical error that we're working to get fixed. Try reloading this page.
Reload Page

## Features
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/marketing-messages/features/

* * *
Resources
# Features
Updated: Dec 12, 2025
Marketing Messages API for WhatsApp (formerly known as Marketing Messages Lite API) is now generally available.
Marketing Messages API for WhatsApp offers added features that are not available on Cloud API, such as performance benchmarks and recommendations, time-to-live, and automated creative optimizations (in testing).
For more detail, see the comparison tables below.
## Optimization features
| Description | Marketing Messages API for WhatsApp (Supports Marketing) | Cloud API (Supports Auth, Utility, Service, Marketing) |
| --- | --- | --- |
| **Quality-based delivery:** Improving deliveries of high engagement messages. | **Yes:** Marketing Messages API for WhatsApp factors if a message is high engagement into delivery decisions, offering up to 9% higher deliveries vs. Cloud API (see footnote below). High engagement marketing messages refers to messages that are expected by users, relevant, and timely, and therefore more likely to be read and clicked. | **No:** Message quality does not factor into per-user marketing message limits. No ability to increase delivery for high engagement messages. |
| **Automated creative optimizations

## Get started
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/marketing-messages/get-started/

* * *
Resources
# Get started
Updated: Dec 4, 2025
Marketing Messages API for WhatsApp (formerly known as Marketing Messages Lite API) is now generally available.
Learn how to send a template message with the Marketing Messages API for WhatsApp (MM API for WhatsApp).
## Requirements
You have an active WhatsApp Business Account and are in a [country eligible for MM API for WhatsApp](https://developers.facebook.com/documentation/business-messaging/whatsapp/marketing-messages/get-started#geographic-availability-of-features).
You have an approved [marketing template message](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/marketing-templates).
You are subscribed to the [messages](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages) webhook.
## Step 1: Accept Terms of Service
Navigate to the [**App Dashboard**](https://developers.facebook.com/apps) \> **WhatsApp** \> **Quickstart** panel.
Locate the “ **Improve ROI with marketing messages with optimizations**” module and click the “ **Get started**” button.
Click on “ **Continue to integration guide**” and accept the Terms of Service.
## Step 2: Send a

## Setting up conversion measurement
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/marketing-messages/measure-conversion/

* * *
Resources
# Setting up conversion measurement
Updated: Nov 19, 2025
Marketing Messages API for WhatsApp (formerly known as Marketing Messages Lite API) is now generally available.
Using Marketing Messages for WhatsApp, you can now integrate your marketing messages with events, allowing you to measure the rate and cost at which a Marketing message sent via Marketing Messages for WhatsApp leads to a downfunnel event like “purchase” on your website or app.
Conversion measurement is built on the same events that you can send to Meta when using Ads, making it seamless for businesses who are already integrated with Events for Ads purposes (e.g. via Pixel or Conversions API for websites, or Meta SDK in their mobile app), to leverage the same reporting automatically with no setup.
If a business is using both marketing messages on Marketing Messages for WhatsApp and Ad Campaigns on the same business portfolio, conversion events reported will be automatically attributed to the last Meta touch (either Marketing Messages for WhatsApp click or Ad click) before the event, based on the attribution window settings of each. For example, if a business is running both an Instagram Ad campaign a

## Onboard business customers
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/marketing-messages/onboard-business-customers/

* * *
Resources
# Onboard business customers
Updated: Nov 24, 2025
Marketing Messages API for WhatsApp (formerly known as Marketing Messages Lite API) is now generally available.
The MM API for WhatsApp onboarding process is designed to be simple for you as a partner to adopt, making it quick and easy for [solution providers](https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/overview) (including Solution Partners, Tech Providers, and Tech Partners) to onboard current customers from Cloud API onto the MM API for WhatsApp. If your business directly integrates with Cloud API without a partner, follow the instructions below to accept the Terms of Service and onboard to the MM API for WhatsApp via WhatsApp Manager.
## Before you begin
Your app must have advanced access for the following permissions:
**`whatsapp_business_messaging`**: This permission allows the app to call the MM API for WhatsApp to send messages.
**`whatsapp_business_management`**: This permission enables the app to manage WABAs, Phone Numbers, and Templates via [WhatsApp Business Management API](https://developers.facebook.com/documentation/business-messaging/whatsapp/analytic

## Onboarding
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/marketing-messages/onboarding/

* * *
Resources
# Onboarding
Updated: Dec 10, 2025
Marketing Messages API for WhatsApp (formerly known as Marketing Messages Lite API) is now generally available.
Onboarding to the Marketing Messages API for WhatsApp (MM API for WhatsApp) is a low-effort upgrade to sending marketing messages with optimizations on Cloud API. See the directions below to onboard your business, whether you integrate with the API directly or work with a partner.
When a business registers for the MM API for WhatsApp, read-only Ad accounts are created that are linked to each of the marketing templates that exist under their business portfolio.
These linked accounts allow a business to:
fetch their MM API for WhatsApp insights from the Marketing API “Insights API” to view the same
These read-only ad accounts are kept in sync with any changes to marketing templates, so that any changes to marketing templates are reflected in the linked ad entity.
Follow the steps below to Onboard to MM API for WhatsApp.
## Eligibility requirements
In order to use the Marketing Messages API for WhatsApp (MM API for WhatsApp), a business must comply with applicable legal, vertical and content restrictions (country dependent)

## Marketing Messages API for WhatsApp
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/marketing-messages/overview/

* * *
Resources
# Marketing Messages API for WhatsApp
Updated: Nov 18, 2025
Marketing Messages API for WhatsApp (formerly known as Marketing Messages Lite API) is now generally available.
MM API for WhatsApp is our next-generation marketing solution built to enhance the customer experience and deliver the right message to more of the right people.
### Key benefits
**Boost and measure business results**: With our automatic delivery optimizations, you can reach more of the people who will find your messages valuable and may drive more reads and clicks. You can also access exclusive measurement insights:
_Performance benchmarks_, to understand how your message performed compared to similar businesses
_Tailored recommendations_, to improve campaign performance
**Enhance customer experience and engagement**: MM API for WhatsApp helps deliver more relevant and timely marketing messages to customers with exclusive features like:
Automatic creative optimizations (in testing), to apply creative treatments like image animation and filtering for more engaging messages.
Richer media formats, like GIFs.
Time-to-live, to avoid irrelevant or delayed message delivery for time-sensitive campaigns.

## Sending messages
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/marketing-messages/send-marketing-messages/

* * *
Resources
# Sending messages
Updated: Dec 3, 2025
Marketing Messages API for WhatsApp (formerly known as Marketing Messages Lite API) is now generally available.
Marketing Messages for WhatsApp allows you to send Marketing template messages only. For sending other message types, and for receiving messages, you can use Cloud API in parallel with Marketing Messages for WhatsApp on the same business phone number.
If you use a partner’s UI portals or APIs to configure and send marketing messages, you can continue to do so, and do not need to use any of the below capabilities - your partner will take care of integrating with MM API for WhatsApp’s message sending functions on your behalf.
## Create marketing templates
Marketing templates can be created in several ways:
Via WhatsApp Business Manager UI
Via the Business Management API “Message Templates” endpoint
If you work with a partner, your partner may offer their own API or UIs for template creation, which leverage the “Message Templates” endpoint
See documentation on how to [Create and Manage Templates here](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/overview).
When a new Marketing temp

## Tracking click events
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/marketing-messages/track-click-events/

* * *
Resources
# Tracking click events
Updated: Nov 18, 2025
Marketing Messages API for WhatsApp (formerly known as Marketing Messages Lite API) is now generally available.
_Available using Marketing Messages API for WhatsApp (MM API for WhatsApp) and Ads Manager only_
We deliver a webhook payload when users click on the body or call-to-action of your marketing message. You can subscribe to this webhook to capture this data and use it to inform your campaign decisions.
## Limitations
At the moment, this feature is not available for all users
Click events are only available for messages sent in the last 7 days
## Webhooks
To receive this webhook, subscribe to the `whatsapp_business_account` webhook topic. The webhook payload is on the `messages` field and is delivered as below:
```
{
"object": "whatsapp_business_account",
"entry": [\
{\
"id": "<WHATSAPP_BUSINESS_ACCOUNT_ID>",\
"changes": [\
{\
"value": {\
"messaging_product": "whatsapp",\
"metadata": {\
"display_phone_number": "<BUSINESS_DISPLAY_PHONE_NUMBER>",\
"phone_number_id": "<BUSINESS_PHONE_NUMBER_ID>"\
},\
"user_actions": [\
{\
"action_type": "marketing_messages_link_click",\
"timestamp": "<time_of_click>",\
"marketing_mess

## Viewing metrics
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/marketing-messages/view-metrics/

* * *
Resources
# Viewing metrics
Updated: Dec 10, 2025
Marketing Messages API for WhatsApp (formerly known as Marketing Messages Lite API) is now generally available.
Conversion metrics will be solely available in the WhatsApp Manager UI and WhatsApp Business Management API that businesses use with Cloud API in October 2025.
As a result, the following conversion metrics will be depreciated:
Viewing conversion metrics via Ads Manager UI ( **September 8th, 2025**).
Viewing conversion metrics via Ads Insights API ( **Q1 2026**).
Businesses that use Marketing Messages API for WhatsApp can view metrics from 4 surfaces:
Via WhatsApp Business Platform surfaces
WhatsApp Manager UI
Via Ads surfaces (optional)
Ads Manager UI “Marketing Messages” tab
Marketing API “ [Insights API](https://developers.facebook.com/docs/marketing-api/insights)”
| ROI Reporting | WhatsApp Business Management surfaces | Ads surfaces |
| --- | --- | --- |
| Messages sent, delivered, read | Y | Y |
| Total amount spent | Y | Y |
| Cost per delivery | Y | Y |
| CTA URL link clicks | Y | Y |
| Cost per click | Y | Y |
| CTA URL link click rate | N | Y |
| Add to cart (Web + App) | Y | Y`*` |
| Checkout initiated (Web

## Address Messages
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/address-messages/

* * *
Resources
# Address Messages
Updated: Nov 7, 2025
This feature is only available for businesses based in India and their India customers.
Address messages give your users a simpler way to share the shipping address with the business on WhatsApp.
Address messages are interactive messages that contain the 4 main parts: `header`, `body`, `footer`, and `action`. Inside the action component business specifies the name “address\_message” and relevant parameters.
Below table outlines the fields that are supported by the address message.
| Field Name | Display Label | Input Type | Supported Countries | Limitations |
| --- | --- | --- | --- | --- |
| `name` | Name | text | India | None |
| `phone_number` | Phone Number | tel | India | Valid phone numbers only |
| `in_pin_code` | Pin Code | text | India | Max length: 6 |
| `house_number` | Flat/House Number | text | India | None |
| `floor_number` | Floor Number | text | India | None |
| `tower_number` | Tower Number | text | India | None |
| `building_name` | Building/Apartment Name | text | India | None |
| `address` | Address | text | India | None |
| `landmark_area` | Landmark/Area | text | India | None |
| `city` | City | text | I

## Audio messages
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/audio-messages/

* * *
Resources
# Audio messages
Updated: Dec 12, 2025
You can use Cloud API to send voice messages and basic audio messages.
## Voice messages
A voice message (sometimes referred to as a voice note, voice memo, or audio) is a recording of one or more persons speaking, and can include background sounds like music. Voice messages include features like automatic download, profile picture, and voice icon, not available with a basic audio message. If the user has set [voice message transcripts](https://l.facebook.com/l.php?u=https%3A%2F%2Ffaq.whatsapp.com%2F241617298315321%2F&h=AT36sQiQTAsDceeeKgAmfdBBgHV5Sh2jdtlrAH5GHlyfNA3nS_o4mKC0Sy7VXUKBK7knNOPMrq6_FkNlRWWd553kaqWYyYc37hjiya2eGD4dtQJ_935s816DfujlYjOrRKkYBP43GAGk2Q) to **Automatic**, a text transcription of the message will also be included.
![](https://scontent-mia5-2.xx.fbcdn.net/v/t39.2365-6/562379210_2249057198900177_5743647093897895635_n.png?_nc_cat=100&ccb=1-7&_nc_sid=e280be&_nc_ohc=DNGEcYSEGQUQ7kNvwGGN0Yx&_nc_oc=AdnjV8p7GseHYltm-rD5ccZqa5kE192W65j5xGwVQB5Ro4FnETCN97R9YIH4yF5n5ik&_nc_zt=14&_nc_ht=scontent-mia5-2.xx&_nc_gid=XpJA5NwmqeWgWP4emLVpYA&oh=00_AfkxwueUPfp5agIh_tyFjeOUTROWuEHqzWjk2vHnSN8HTg&oe=6964E00C)
Voice messages r

## Contacts messages
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/contacts-messages/

* * *
Resources
# Contacts messages
Updated: Nov 3, 2025
Contacts messages allow you to send rich contact information directly to WhatsApp users, such as names, phone numbers, physical addresses, and email addresses.
![](https://scontent-mia5-1.xx.fbcdn.net/v/t39.2365-6/441381765_2668119610015051_1596469393832242771_n.png?_nc_cat=104&ccb=1-7&_nc_sid=e280be&_nc_ohc=RizCVo5Kb24Q7kNvwEB5_7e&_nc_oc=Adk3onxIV4q9YGzkUBBERpOUtCNhisQWzLk6FvhlenIE7iRJfqmqV0_PsR1ZwF0KZE8&_nc_zt=14&_nc_ht=scontent-mia5-1.xx&_nc_gid=D1CqCDl4HVrX6GqEp5zMGQ&oh=00_AflGQfRt4xMmNKlOxrVgrPGZCVHL1H6fLKjPr4reXKw1xA&oe=696501B2)
When a WhatsApp user taps the message’s profile arrow, it displays the contact’s information in a profile view:
![](https://scontent-mia5-2.xx.fbcdn.net/v/t39.2365-6/441391825_1516000578987481_5920245070887074504_n.png?_nc_cat=100&ccb=1-7&_nc_sid=e280be&_nc_ohc=lwBKz8KxoQ4Q7kNvwEHIRbj&_nc_oc=AdkK_5PbRWT74uS8qnzSqrJeZaDNHa8CBA-WMmg_Dcr7HNDVQm5h3tm8x0MXNQO7VbM&_nc_zt=14&_nc_ht=scontent-mia5-2.xx&_nc_gid=D1CqCDl4HVrX6GqEp5zMGQ&oh=00_Afm1jy6VA3Qsz5uyaaOQnwIJqONDzk0EMlX-8kqRJ9ccXw&oe=6964FE67)
Each message can include information for up to 257 contacts, although it is recommended to send fewer for u

## Contextual replies
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/contextual-replies/

* * *
Resources
# Contextual replies
Updated: Oct 21, 2025
Contextual replies are a special way of responding to a WhatsApp user message. Sending a message as a contextual reply makes it clearer to the user which message you are replying to by quoting the previous message in a contextual bubble:
![](https://scontent-lax3-2.xx.fbcdn.net/v/t39.2365-6/441349069_1363509007609494_6528221959622289637_n.png?_nc_cat=103&ccb=1-7&_nc_sid=e280be&_nc_ohc=yJHAIDDja18Q7kNvwH2zgCo&_nc_oc=Adn4vzmucExCJ5SUtdeogWeSKBVhJkVPhRucbkDrtpRtj0SjWcm_DrGvs5cBCUr3TQI&_nc_zt=14&_nc_ht=scontent-lax3-2.xx&_nc_gid=kEvkxAAZWNcLblaRXufeyQ&oh=00_Aflj-HbNvWVoVqJ0Mpa_Cy3JM90vkwI3C6nmkDZLTLr_8A&oe=6964E9EB)
## Limitations
You cannot send a [reaction message](https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/reaction-messages) as a contextual reply.
The contextual bubble will not appear at the top of the delivered message if:
The previous message has been deleted or moved to long term storage (messages are typically moved to long term storage after 30 days, unless you have enabled [local storage](https://developers.facebook.com/documentation/business-messaging/whatsapp/local-storage)).
Y

## Document messages
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/document-messages/

* * *
Resources
# Document messages
Updated: Nov 3, 2025
Document messages are messages that display a document icon, linked to a document, that a WhatsApp user can tap to download.
![](https://scontent-mia5-1.xx.fbcdn.net/v/t39.2365-6/441287424_3695370760733536_48188157634176922_n.png?_nc_cat=101&ccb=1-7&_nc_sid=e280be&_nc_ohc=yTOPrf7NvQ8Q7kNvwFPiFJZ&_nc_oc=AdnWQb9JG21FeFElZ-GtjXZEDkgyMTqPbr0irt93NQKYIc2j4q2SJ0viVuUhdGdhWnI&_nc_zt=14&_nc_ht=scontent-mia5-1.xx&_nc_gid=sds685SXXUjkoeTUr3kzOg&oh=00_Afl8jNCLMY7Xxn4XS89-NXVO2vKNJfMLQIDZQ8wrD_arhw&oe=6964EC08)
## Request syntax
Use the [POST /<WHATSAPP\_BUSINESS\_PHONE\_NUMBER\_ID>/messages](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-phone-number/message-api) endpoint to send a document message to a WhatsApp user.
```
curl 'https://graph.facebook.com/<API_VERSION>/<WHATSAPP_BUSINESS_PHONE_NUMBER_ID>/messages' \
-H 'Content-Type: application/json' \
-H 'Authorization: Bearer EAAJB...' \
-d '
{
"messaging_product": "whatsapp",
"recipient_type": "individual",
"to": "<WHATSAPP_USER_PHONE_NUMBER>",
"type": "document",
"document": {
"id": "<MEDIA_ID>", <!-- Only if using uploaded medi

## Image messages
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/image-messages/

* * *
Resources
# Image messages
Updated: Nov 3, 2025
Image messages are messages that display a single image and an optional caption.
![](https://scontent-mia3-3.xx.fbcdn.net/v/t39.2365-6/440788911_1344094656981591_356280964045551612_n.png?_nc_cat=110&ccb=1-7&_nc_sid=e280be&_nc_ohc=9Jydcy3SEq8Q7kNvwHql6Tr&_nc_oc=Admum4Tq7fAMx6asszwIvJbXsOSGerbnuH3nxOa2uITd-dXcAeMv-dNtaYMq-iJxXsk&_nc_zt=14&_nc_ht=scontent-mia3-3.xx&_nc_gid=HO_8PxuquX8nzHeKexM_gg&oh=00_AfklkxerwPDQeTiinUkVQpBvn8U2ue6yqDcdCuO7j4NvOQ&oe=6964DD89)
## Request syntax
Use the [POST /<WHATSAPP\_BUSINESS\_PHONE\_NUMBER\_ID>/messages](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-phone-number/message-api) endpoint to send an image message to a WhatsApp user.
```
curl 'https://graph.facebook.com/<API_VERSION>/<WHATSAPP_BUSINESS_PHONE_NUMBER_ID>/messages' \
-H 'Content-Type: application/json' \
-H 'Authorization: Bearer <ACCESS_TOKEN>' \
-d '
{
"messaging_product": "whatsapp",
"recipient_type": "individual",
"to": "<WHATSAPP_USER_PHONE_NUMBER>",
"type": "image",
"image": {
"id": "<MEDIA_ID>", <!-- Only if using uploaded media -->
"link": "<MEDIA_URL>", <!-- Only if using

## Interactive Call-to-Action URL Button Messages
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/interactive-cta-url-messages/

* * *
Resources
# Interactive Call-to-Action URL Button Messages
Updated: Nov 3, 2025
WhatsApp users may be hesitant to tap raw URLs containing lengthy or obscure strings in text messages. In these situations, you may wish to send an interactive call-to-action (CTA) URL button message instead. CTA URL button messages allow you to map any URL to a button so you don’t have to include the raw URL in the message body.
![](https://scontent-mia3-2.xx.fbcdn.net/v/t39.2365-6/498114174_2231456237292792_1964702441845433307_n.png?_nc_cat=105&ccb=1-7&_nc_sid=e280be&_nc_ohc=itlvQVdFEgwQ7kNvwFd99P-&_nc_oc=AdnVZeiuYxcWRU3J9SMh3NKzq2UujwZCQMr4KSYc9UYu92p361ObtVVmJgVRglRRnUs&_nc_zt=14&_nc_ht=scontent-mia3-2.xx&_nc_gid=HVH0wsD9ndfcqQZuan4-Iw&oh=00_Afm28W9wt64wIyBSJr-HHjBabYlPsA4jX77KCbwS5RRjqg&oe=6964F711)
## Request syntax
Endpoint: [POST /<WHATSAPP\_BUSINESS\_PHONE\_NUMBER\_ID>/messages](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-phone-number/message-api)
```
curl 'https://graph.facebook.com/<API_VERSION>/<WHATSAPP_BUSINESS_PHONE_NUMBER_ID>/messages' \
-H 'Content-Type: application/json' \
-H 'Authorization: Bearer <ACCESS_TOKEN>' \
-d '
{

## Interactive list messages
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/interactive-list-messages/

* * *
Resources
# Interactive list messages
Updated: Nov 3, 2025
Interactive list messages allow you to present WhatsApp users with a list of options to choose from (options are defined as rows in the request payload):
![](https://scontent-mia3-1.xx.fbcdn.net/v/t39.2365-6/439906651_815131396632137_2393939757123941379_n.png?_nc_cat=106&ccb=1-7&_nc_sid=e280be&_nc_ohc=XP-EqU4Y50kQ7kNvwFAgIhU&_nc_oc=AdmRXvGNY1UYJxi-5srONRhMPMXy7sEcEIfIpoHlfgYy9H6PZW8HOs0sj9WYxD9uEdY&_nc_zt=14&_nc_ht=scontent-mia3-1.xx&_nc_gid=U2R5R9HjgQZgO12zM-n5tQ&oh=00_AfkavmRg_BOYFlbt0r0O11PFyDOTlXMP5qykA8sHmerzLA&oe=69650291)
When a user taps the button in the message, it displays a modal that lists the options available:
![](https://scontent-mia3-3.xx.fbcdn.net/v/t39.2365-6/440772174_1215031642793437_4263879536705453309_n.png?_nc_cat=109&ccb=1-7&_nc_sid=e280be&_nc_ohc=pgMtYfwyKr0Q7kNvwG-xkpn&_nc_oc=Adm3moI3uEN1Dzy9shuCMzQMN9Yq4ENSVFUNNOPN5L1TnxzFcT7auO-Pg9hh_Hhy9Gg&_nc_zt=14&_nc_ht=scontent-mia3-3.xx&_nc_gid=U2R5R9HjgQZgO12zM-n5tQ&oh=00_AfntdrDV1rHkXSTsgbCEoe06VXAEkTjxKRVmxbBikqBh6g&oe=6964EBC3)
Users can then choose one option and their selection will be sent as a reply:
![](https://scontent-mia3-1.xx.fbcdn.net/v

## Interactive media carousel messages
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/interactive-media-carousel-messages/

* * *
Resources
# Interactive media carousel messages
Updated: Oct 21, 2025
This message type will be available for delivery to WhatsApp users on November 11.
The interactive media carousel message enables businesses to send horizontally scrollable cards with images or videos, each with a call-to-action button, within WhatsApp conversations. This format allows users to browse multiple offers or content in a single message, providing a rich and engaging experience via the WhatsApp Business APIs and mobile clients.
## How to build a media carousel message
The media carousel message contains a `card` object. You must add at least 2 card objects to your message, and can add a maximum of 10. Each card exists in a `cards[]` array and must be given a `card_index` value of `0` through `9`.
The type of each card must be set to `"cta_url"`, and all cards must have the same header type (`"image"` or `"video"`). Each card must include a header, a unique index, and a call-to-action button with display text and a URL.
You must add a message body to the message (max 1024 characters). No header, footer, or buttons are allowed outside the cards.
### The `card` object
```
...
{
"card_index": 0,
"typ

## Interactive product carousel messages
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/interactive-product-carousel-messages/

* * *
Resources
# Interactive product carousel messages
Updated: Dec 4, 2025
This message type will be available for delivery to WhatsApp users on November 11.
The interactive product carousel message enables businesses to send horizontally scrollable product cards within WhatsApp conversations, allowing users to browse and engage with products directly in-thread.
This format integrates with the Product Catalog and supports Single Product Message (SPM) actions on each card, providing a seamless and interactive shopping experience via the WhatsApp Business APIs and mobile clients
## How to build a product carousel message
The product carousel message contains a `card` object. You must add 2 card objects to your message, and can add a maximum of 10. Each card exists in a `cards[]` array and must be given a `"card_index"` value of `0` through `9`.
The type of each card must be set to `"product"`, and each card must reference the same `"catalog_id"`.
You must add a message body to the message, and no header, footer, or buttons are allowed.
Lastly, each card must specify the product and catalog identifiers `"product_retailer_id"` and `"catalog_id"`.
### The `card` object
```
...
{
"card

## ## This page isn't available right now
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/interactive-reply-buttons-messages/

## This page isn't available right now
This may be because of a technical error that we're working to get fixed. Try reloading this page.
Reload Page

## Location messages
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/location-messages/

* * *
Resources
# Location messages
Updated: Nov 3, 2025
Location messages allow you to send a location’s latitude and longitude coordinates to a WhatsApp user.
![](https://scontent-mia3-3.xx.fbcdn.net/v/t39.2365-6/440753150_1614554799358194_4095127988263974385_n.png?_nc_cat=108&ccb=1-7&_nc_sid=e280be&_nc_ohc=29JF_R6yYicQ7kNvwFwyMem&_nc_oc=AdlDK7tkQRFp_EzSR3KyGjYxAoxGD2cBwp0vYRp36pHvQzNfCu_oiEXnffNcZLWFhVw&_nc_zt=14&_nc_ht=scontent-mia3-3.xx&_nc_gid=OTiix6FjkKDbrMcmc1-xTg&oh=00_AfmHXs--xWLxZD92buqRHjFAdjDubL5P4udsB1cEk5EwzA&oe=6964E461)
## Request syntax
Use the [POST /<WHATSAPP\_BUSINESS\_PHONE\_NUMBER\_ID>/messages](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-phone-number/message-api) endpoint to send a location message to a WhatsApp user.
```
curl 'https://graph.facebook.com/<API_VERSION>/<WHATSAPP_BUSINESS_PHONE_NUMBER_ID>/messages' \
-H 'Content-Type: application/json' \
-H 'Authorization: Bearer <ACCESS_TOKEN>' \
-d '
{
"messaging_product": "whatsapp",
"recipient_type": "individual",
"to": "<WHATSAPP_USER_PHONE_NUMBER>",
"type": "location",
"location": {
"latitude": "<LOCATION_LATITUDE>",
"longitude": "<LOCATION_LONGIT

## Location request messages
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/location-request-messages/

* * *
Resources
# Location request messages
Updated: Nov 3, 2025
Location request messages display **body text** and a **send location button**. When a WhatsApp user taps the button, a location sharing screen appears which the user can then use to share their location.
![](https://scontent-mia3-2.xx.fbcdn.net/v/t39.2365-6/411712787_1346691626211128_4092487602815472288_n.png?_nc_cat=105&ccb=1-7&_nc_sid=e280be&_nc_ohc=e1gR2ZRA65MQ7kNvwH-p-4E&_nc_oc=AdmJs-xb2-wHZhtam5Ng8pRaZ_Ptg44GNn7CiM5E8tyWwk4E3oWbY_2G-vNUb13ZXrc&_nc_zt=14&_nc_ht=scontent-mia3-2.xx&_nc_gid=phnvkTVEaZ_mhmT8WHk3vA&oh=00_AfnEt0ubF8ae2BA043O9j1U-Lnc0LUv1oEz2KYZBZpLHgQ&oe=6964DEEA)
Once the user shares their location, a **messages** webhook is triggered, containing the user’s location details.
## Request syntax
Use the [POST /<WHATSAPP\_BUSINESS\_PHONE\_NUMBER\_ID>/messages](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-phone-number/message-api) endpoint to send a location request message to a WhatsApp user.
```
curl 'https://graph.facebook.com/<API_VERSION>/<WHATSAPP_BUSINESS_PHONE_NUMBER_ID>/messages' \
-H 'Content-Type: application/json' \
-H 'Authorization: Bea

## Mark messages as read
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/mark-message-as-read/

* * *
Resources
# Mark messages as read
Updated: Nov 3, 2025
When you get a **messages** webhook indicating an [incoming message](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-phone-number/message-api), you can use the `message.id` value to mark the message as read.
![](https://scontent-mia3-2.xx.fbcdn.net/v/t39.2365-6/491643461_603380552708521_8284248965365504291_n.png?_nc_cat=105&ccb=1-7&_nc_sid=e280be&_nc_ohc=LflcuRH577cQ7kNvwEKZgGn&_nc_oc=AdmKyY65y6F47osGBtCuu7j8utAF8e1OcGUQk9Tk9H94Nr9MINYD0QOVVIg688z-MnY&_nc_zt=14&_nc_ht=scontent-mia3-2.xx&_nc_gid=O907Fxtvka3Wfo6NAlviXQ&oh=00_Afm99dZjVm94VhLHKz-Cq04H1Z2Y_Gln8738TDp8gNbkKw&oe=6964E5F0)
It’s good practice to mark an incoming messages as read within 30 days of receipt. Marking a message as read will also mark earlier messages in the thread as read.
## Request syntax
Use the [POST /<WHATSAPP\_BUSINESS\_PHONE\_NUMBER\_ID>/messages](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-phone-number/message-api) endpoint to mark a message as read.
```
curl -X POST \
'https://graph.facebook.com/<API_VERSION>/<WHATSAPP_BUSINESS_PHONE

## ## This page isn't available right now
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/message-with-link/

## This page isn't available right now
This may be because of a technical error that we're working to get fixed. Try reloading this page.
Reload Page
* * *

## ## This page isn't available right now
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/payload-encryption/

## This page isn't available right now
This may be because of a technical error that we're working to get fixed. Try reloading this page.
Reload Page
* * *

## Reaction messages
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/reaction-messages/

* * *
Resources
# Reaction messages
Updated: Nov 3, 2025
Reaction messages are emoji-reactions that you can apply to a previous WhatsApp user message that you have received.
![](https://scontent-mia3-2.xx.fbcdn.net/v/t39.2365-6/440791676_2613895758778914_1777908069161322734_n.png?_nc_cat=103&ccb=1-7&_nc_sid=e280be&_nc_ohc=kUBuG0qTWqIQ7kNvwF5Uxhn&_nc_oc=AdlCExwJPwEW9RQT8eXiIYe4rqOldsCgHJEpnYmBLLspO8c_F6QznjOx21ooKG6v6iE&_nc_zt=14&_nc_ht=scontent-mia3-2.xx&_nc_gid=-RsaBC116VETnMuUU-mKIQ&oh=00_AfnaIYgcweuL7lByMH2IV6nQZJ_WuiH-YIANaMZiMsVMSg&oe=696500F1)
## Limitations
When sending a reaction message, only a [sent message webhook](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages/status) (`status` set to `sent`) will be triggered; delivered and read message webhooks will not be triggered.
## Request syntax
Use the [POST /<WHATSAPP\_BUSINESS\_PHONE\_NUMBER\_ID>/messages](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-phone-number/message-api) endpoint to apply an emoji reaction on a message you have received from a WhatsApp user.
```
curl 'https://graph.facebook.com/<API_VERSION>/<W

## Sending messages
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/send-messages/

* * *
Resources
# Sending messages
Updated: Nov 4, 2025
This document describes how to use the API to send messages to WhatsApp users.
## Message types
You can use the API to send the following types of messages.
[Address messages](https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/address-messages) allow you to easily request a delivery address from WhatsApp users.
![](https://scontent-mia3-3.xx.fbcdn.net/v/t39.2365-6/441384197_454102407352120_3773045747928009795_n.png?_nc_cat=110&ccb=1-7&_nc_sid=e280be&_nc_ohc=BX5DjsfW-4YQ7kNvwH-okfU&_nc_oc=AdnzQuZZxB6byH2_Kxe5IwfF5M4NF2gSGtORqgzotn5fSru6s9OOa5ecT6DvJ_8dtJs&_nc_zt=14&_nc_ht=scontent-mia3-3.xx&_nc_gid=c-UMsJ3a3OiI2HmgQIZ8ww&oh=00_Aflmrc_AFVB1tk41u8iLrC244qb_hE8M5Wj46ch0fTjeDg&oe=6964D9A2)
[Audio messages](https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/audio-messages) display an audio icon and a link to an audio file. When the WhatsApp user taps the icon, the WhatsApp client loads and plays the audio file.
![](https://scontent-mia3-1.xx.fbcdn.net/v/t39.2365-6/441333612_1102926104368016_6233568143947105840_n.png?_nc_cat=106&ccb=1-7&_nc_sid=e280be&_nc_ohc=-5ZddMg50Aw

## Sticker messages
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/sticker-messages/

* * *
Resources
# Sticker messages
Updated: Nov 3, 2025
Sticker messages display animated or static sticker images in a WhatsApp message.
![](https://scontent-mia3-2.xx.fbcdn.net/v/t39.2365-6/441292863_1203428507688350_9164958282076997505_n.png?_nc_cat=103&ccb=1-7&_nc_sid=e280be&_nc_ohc=6MHekcfkgeEQ7kNvwGjecuw&_nc_oc=AdnGmg9RUt0or6hT6GU_V4k7cuj03CYJkAE2EL7E6xg-JWjlrh2FxDRUcY9kt6MULkQ&_nc_zt=14&_nc_ht=scontent-mia3-2.xx&_nc_gid=Pl_FkpqHBYzkQKBeEubfWw&oh=00_AfkboNNyePYtbbFK73YYFUZwRdfgbyK5hzNQszKIYqxE4A&oe=6965073C)
## Request syntax
Use the [POST /<WHATSAPP\_BUSINESS\_PHONE\_NUMBER\_ID>/messages](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-phone-number/message-api) endpoint to send a sticker message to a WhatsApp user.
```
curl 'https://graph.facebook.com/<API_VERSION>/<WHATSAPP_BUSINESS_PHONE_NUMBER_ID>/messages' \
-H 'Content-Type: application/json' \
-H 'Authorization: Bearer <ACCESS_TOKEN>' \
-d '
{
"messaging_product": "whatsapp",
"recipient_type": "individual",
"to": "<WHATSAPP_USER_PHONE_NUMBER>",
"type": "sticker",
"sticker": {
"id": "<MEDIA_ID>", <!-- Only if using uploaded media -->
"link": "<MEDIA_URL>", <!-- Only

## Template Messages
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/template-messages/

* * *
Resources
# Template Messages
Updated: Nov 4, 2025
Template messages are used to send [templates](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/overview) to WhatsApp users. Templates can cover customer care messages, appointment reminders, payment and shipping updates, and much more.
![](https://scontent-mia5-1.xx.fbcdn.net/v/t39.2365-6/555677225_1191798406305539_8221742988743767334_n.png?_nc_cat=102&ccb=1-7&_nc_sid=e280be&_nc_ohc=GyJWciA2wi4Q7kNvwGjbt0y&_nc_oc=AdmTcRCRb0diHQKn1ZxqZNN32TDvUigyVPNAYcHYSoB276d2f0FWbIjEc86Sh8xYzog&_nc_zt=14&_nc_ht=scontent-mia5-1.xx&_nc_gid=Wt45yzETRbqU-a73sN1j3w&oh=00_AflXvx2iaphQXR0PAmuKKULDnhY9BfOifTo89Xz1NA5Xpw&oe=6964EC23)
Templates are reusable and can be sent to WhatsApp users outside of a [customer service window](https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/send-messages#customer-service-windows), however they must be approved before they can be sent in a template message. Templates are also subject to multiple processes that can affect your ability to send them to users, such as quality scores, pausing, and pacing.
Because there’s a lot to know about templates,

## Text messages
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/text-messages/

* * *
Resources
# Text messages
Updated: Nov 3, 2025
Text messages are messages containing only a text body and an optional link preview.
![](https://scontent-mia3-1.xx.fbcdn.net/v/t39.2365-6/440742591_797870012016470_1123226266833971975_n.png?_nc_cat=106&ccb=1-7&_nc_sid=e280be&_nc_ohc=GEwe-rpBRCoQ7kNvwHQ1B1D&_nc_oc=Adl0Pp3CGi5B2a7dyEnJ29bkLjTdgxksa7Xvn_xKX4KgjCvN_z44R0hXTo4GgZF8sFY&_nc_zt=14&_nc_ht=scontent-mia3-1.xx&_nc_gid=2B3q53t7hPbUHw27D8d4Lw&oh=00_AflGYP3EYz2nMpWhhRljt1DOa0drhkvV9q5g78QPmxDM0w&oe=6964D3EB)
## Request syntax
Use the [POST /<WHATSAPP\_BUSINESS\_PHONE\_NUMBER\_ID>/messages](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-phone-number/message-api) endpoint to send a text message to a WhatsApp user.
```
curl 'https://graph.facebook.com/<API_VERSION>/<WHATSAPP_BUSINESS_PHONE_NUMBER_ID>/messages' \
-H 'Content-Type: application/json' \
-H 'Authorization: Bearer <ACCESS_TOKEN>' \
-d '
{
"messaging_product": "whatsapp",
"recipient_type": "individual",
"to": "<WHATSAPP_USER_PHONE_NUMBER>",
"type": "text",
"text": {
"preview_url": <ENABLE_LINK_PREVIEW>,
"body": "<BODY_TEXT>"
}
}'
```
### Request parameters
| Placeho

## ## This page isn't available right now
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/video-messages/

## This page isn't available right now
This may be because of a technical error that we're working to get fixed. Try reloading this page.
Reload Page

## Messaging Limits
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/messaging-limits/

* * *
Resources
# Messaging Limits
Updated: Nov 26, 2025
The `messaging_limit_tier` field, which used to return a business phone number’s messaging limit, has been deprecated. [Request](https://developers.facebook.com/documentation/business-messaging/whatsapp/messaging-limits/#via-api) the `whatsapp_business_manager_messaging_limit` field instead.
This document describes messaging limits for the WhatsApp Business Platform.
Messaging limits are the maximum number of unique WhatsApp user phone numbers your business can deliver messages to, outside of a [customer service window](https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/send-messages#customer-service-windows), within a moving 24-hour period.
Messaging limits are calculated and set at the business portfolio level and are shared by all business phone numbers within a portfolio. This means that if a business portfolio has multiple business phone numbers, it’s possible for one number to consume all of the portfolio’s messaging capability within a given period.
Newly created business portfolios have a messaging limit of 250, but this limit can be increased to:
2,000 (by completing a [scaling path](h

## No Storage
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/no-storage/

* * *
Resources
# No Storage
Updated: Dec 1, 2025
“No Storage” is a custom configuration of Cloud API [local storage](https://developers.facebook.com/documentation/business-messaging/whatsapp/local-storage), where the data in-transit is kept for up to an hour in Meta data centers and the data is not persisted at rest (that is to say, not in Meta data centers nor in AWS In-Country stores).
Outgoing/incoming messages are stored for a maximum of 1 hour in Meta data centers.
Outgoing/incoming media blobs are stored for a maximum of 1 hour in Meta data centers.
You can pass a custom time-to-live (TTL) — from 1 hour to 30 days — when uploading media to override the 1 hour expiration (particularly useful for marketing campaigns which reuse the same media)
![](https://scontent-mia5-1.xx.fbcdn.net/v/t39.2365-6/559308894_1116451836859295_8169970485040161301_n.png?_nc_cat=102&ccb=1-7&_nc_sid=e280be&_nc_ohc=JScV_BRzNWoQ7kNvwFTSjCv&_nc_oc=AdkpMVC_lQMQtIWl_d1E0M17YbJHM5w79Fjam0utbszdK7LjeFHtbjc5byvXQ1HEh4k&_nc_zt=14&_nc_ht=scontent-mia5-1.xx&_nc_gid=TVtKI1u1UjXatKZGQABRCw&oh=00_Afku5UqAoE7LAUxDuekUJC6fBOfGk4K4omSHk_WmMyIPzw&oe=6964F455)
## Limitations
When the No Storage feature is enabled, mess

## Official Business Accounts
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/official-business-accounts/

* * *
Resources
# Official Business Accounts
Updated: Dec 12, 2025
An Official Business Account (“OBA”) is a business phone number owned by a business that has been verified as an authentic and notable brand according to specific [criteria](https://developers.facebook.com/documentation/business-messaging/whatsapp/official-business-accounts/#eligibility). Official Business Account business phone numbers have a blue checkmark beside their name in the contacts view.
![](https://scontent-mia5-2.xx.fbcdn.net/v/t39.2365-6/456954377_453386597161620_5745766558871976538_n.png?_nc_cat=100&ccb=1-7&_nc_sid=e280be&_nc_ohc=x1X3oabZN00Q7kNvwFGwVcx&_nc_oc=Adl6AjTPwtO7HO-nqZRXdqPaRpCrEACxOhk6OdgDJr070YCihaGuLxlauUezUyhN8eg&_nc_zt=14&_nc_ht=scontent-mia5-2.xx&_nc_gid=6yTsIH0BsYew4LaMcNshXg&oh=00_AfmUEqmY_fE6i3IvOjTVvdLHPm0mHqhzjRBn0cf2ZfGn3g&oe=6964F433)
You can request OBA status for a business phone number using WhatsApp Manager or API. Once we’ve reviewed your request, you will receive a notification letting you know if your business phone has been granted OBA Number status or not. If your request is rejected, you can submit a new request after 30 days.
We do not grant OBA status to business empl

## WhatsApp Business Platform
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/overview/

* * *
Resources
# WhatsApp Business Platform
Drive revenue growth, boost efficiency, and deliver exceptional customer experiences with the WhatsApp Business Platform—our enterprise-grade APIs for messaging and calling.
## Demo the API
Preview an interactive experience showing how Jasper’s Market (our demo retail business) connects with customers using the WhatsApp Business Platform.
Demo retail business![](https://scontent-mia3-2.xx.fbcdn.net/v/t39.8562-6/547429620_764982376167016_715228206216507834_n.png?stp=dst-webp&_nc_cat=105&ccb=1-7&_nc_sid=9a942e&_nc_ohc=D-aOD7N-vc4Q7kNvwHz-Wjh&_nc_oc=Adl0kfAAml3Sro_qgwEarknk4g_KAhbGdfAQe-oy4L88DOPJdwZJ0e32Zq4fFC5GoYg&_nc_zt=14&_nc_ht=scontent-mia3-2.xx&_nc_gid=2jT_neu5rqMJsR-bzcBKkg&oh=00_AfnGhjLehHS7mLNvMlvR5rkf8Z7zQlDdnmNeMT2y8hGdfQ&oe=695069FE)
Try the demo
Select language
PythonJavaScriptcURL
* * *
```
import requests
url = "https://graph.facebook.com/<API_VERSION>/<WHATSAPP_BUSINESS_PHONE_NUMBER_ID>/messages"
headers = {
"Authorization": "Bearer <ACCESS_TOKEN>",
"Content-Type": "application/json",
}
data = {
"messaging_product": "whatsapp",
"to": "<WHATSAPP_USER_PHONE_NUMBER>",
"type": "template",
"template": {
"name": "hello_world",
"l

## Boleto
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/payments/payments-br/boleto/

* * *
Resources
# Boleto
Updated: Nov 14, 2025
Payments API also enables businesses to collect payments from their customers via WhatsApp using Boleto.
When using this integration, WhatsApp only facilitates the communication between merchants and buyers. Merchants are responsible for integrating with a PSP from which they can generate Boleto codes, and confirm their payment.
## Before you start
Familiarize yourself with the [Orders API](https://developers.facebook.com/documentation/business-messaging/whatsapp/payments/payments-br/orders). Orders are the entrypoint for collecting payments in WhatsApp.
You will need an existing integration with a PSP to generate Boleto codes and do automatic reconciliation when a payment is made.
You must update the order status as soon as a payment is made.
## Integration steps
The following sequence diagram shows the typical integration with Boleto.
![Image](https://scontent-mia3-3.xx.fbcdn.net/v/t39.2365-6/561622607_1339318274593490_8768265383653853535_n.jpg?_nc_cat=110&ccb=1-7&_nc_sid=e280be&_nc_ohc=CZnJRwR_-r8Q7kNvwGYBqMZ&_nc_oc=AdkbOrbgbNvC9_RFp2l04kpsRJqb-UUITZYiCpv_TfdsiaSKiLeNxtLrCwqia6HW8MY&_nc_zt=14&_nc_ht=scontent-mia3-3.xx&_nc_gid=brftIw

## Offsite Pix payments
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/payments/payments-br/offsite-pix/

* * *
Resources
# Offsite Pix payments
Updated: Nov 14, 2025
Payments API also enables businesses to collect payments from their customers via WhatsApp using dynamic Pix codes.
When using this integration, WhatsApp only facilitates the communication between merchants and buyers. Merchants are responsible for integrating with a bank or PSP in order to generate dynamic Pix codes, and confirm their payment.
## Before you start
Familiarize yourself with the [Orders API](https://developers.facebook.com/documentation/business-messaging/whatsapp/payments/payments-br/orders). Orders are the entrypoint for collecting payments in WhatsApp.
You will need an existing integration with a bank or PSP to generate dynamic Pix codes and do automatic reconciliation when a payment is made. You must be able to update the order status as soon as a payment is made.
## Integration steps
The following sequence diagram shows the typical integration with Pix.
![Image](https://scontent-lax7-1.xx.fbcdn.net/v/t39.2365-6/559928787_1339318127926838_2798974158408097525_n.jpg?_nc_cat=101&ccb=1-7&_nc_sid=e280be&_nc_ohc=IPujbs4aeksQ7kNvwFFEVxn&_nc_oc=AdmAISB_Lhu6fCwoWt5dCXln87DvpIDR4O9tm53XWivhbgKitArkeYlzY6xLikRiZnk

## One-Click Payments
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/payments/payments-br/one-click-payments/

* * *
Resources
# One-Click Payments
Updated: Nov 14, 2025
This feature is not publicly available yet and is only available for businesses based in Brazil and their Brazilian customers. To enable payments for your businesses, please contact your Solution Partner.
Payments API also enables businesses to collect payments from their customers via WhatsApp using One-Click Payments.
When using this integration, WhatsApp facilitates communication between merchants and buyers. Merchants are responsible for storing payment credentials and integrating with a payment service provider (PSP) to submit these credentials, completing and confirming their payments.
## Before you start
Familiarize yourself with the [Orders API](https://developers.facebook.com/documentation/business-messaging/whatsapp/payments/payments-br/orders). Orders are the entrypoint for collecting payments in WhatsApp.
You will need an existing integration with a PSP and do automatic reconciliation when a payment is made.
You must update the order status as soon as a payment is made.
## Integration steps
The following sequence diagram shows the typical integration with One-Click Payments.
![Image](https://scontent-mia5-1.xx.f

## Send order details template message
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/payments/payments-br/orderdetailstemplate/

* * *
Resources
# Send order details template message
Updated: Nov 4, 2025
## Overview
Order details message template is a template with [interactive components](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/overview#components) that extends the call-to-action button to support sending order details and provides a richer experience compared to templates with only text components.
Once your Order details message templates have been created and approved, you can use the approved template to send the template message with order or bill information to prompt customers to make a payment.
Before sending an order details template message, businesses need to create a template with an “order details” call-to-action button. See [Create Message Templates for Your WhatsApp Business Account](https://www.facebook.com/business/help/2055875911147364?id=2129163877102343) for more information on prerequisites and how to create a template.
## Creating an order details template on Whatsapp Manager
To create an order details template, business needs a business portfolio with a WhatsApp Business Account.
In **WhatsApp Manager** \> **Account tools**:
Click on `create

## Orders
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/payments/payments-br/orders/

* * *
Resources
# Orders
Updated: Nov 14, 2025
Payments API introduces two new types of [interactive messages](https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/send-messages#interactive-messages): `order_details` and `order_status`. They are the entrypoint to collect payment in WhatsApp.
`order_details` messages are sent to create an order in the buyer’s WhatsApp client app. This message includes a list of the items being purchased, any fees being charged, and the payment settings used to collect payment. The payment settings will vary depending on the integration type ( [Pix](https://developers.facebook.com/documentation/business-messaging/whatsapp/payments/payments-br/offsite-pix), [payment links](https://developers.facebook.com/documentation/business-messaging/whatsapp/payments/payments-br/payment-links), [Boleto](https://developers.facebook.com/documentation/business-messaging/whatsapp/payments/payments-br/boleto)).
`order_status` messages are sent when businesses update the order status either based on the WhatsApp payment status change notification or based on their internal processes.
![Image](https://scontent-mia3-1.xx.fbcdn.net/v/t39.2365-

## Payments API - Brazil
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/payments/payments-br/overview/

* * *
Resources
# Payments API - Brazil
Updated: Nov 14, 2025
Payments API enable businesses to accept payments from their customers via WhatsApp. Businesses send `order_details` messages ( [Orders API](https://developers.facebook.com/documentation/business-messaging/whatsapp/payments/payments-br/orders)) to their customers, then get notified about payment status updates via webhook notifications.
Based on the selected use case, businesses can collect payment from the customers using one of the following integrations:
## How It Works
First, the business composes and sends an `order_details` message, which is a new type of interactive message. It contains the same 4 main components: header, body, footer, and action. Inside the action component, the business includes all the information needed for the customer to complete their payment.
Each `order_details` message **must** contain a **unique `reference_id`** provided by the business. This reference id is used throughout the flow to track the order.
Once the message is sent, the business waits for a payment or transaction status update. The type of the update depends on the integration type (e.g.: [Pix](https://developers.facebook.co

## Payment links
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/payments/payments-br/payment-links/

* * *
Resources
# Payment links
Updated: Nov 14, 2025
Payments API also enables businesses to collect payments from their customers via WhatsApp using Payment Links.
When using this integration, WhatsApp only facilitates the communication between merchants and buyers. Merchants are responsible for integrating with a PSP from which they can generate Payment Links, and confirm their payment.
## Before You Start
Familiarize yourself with the [Orders API](https://developers.facebook.com/documentation/business-messaging/whatsapp/payments/payments-br/orders). Orders are the entrypoint for collecting payments in WhatsApp.
You will need an existing integration with a PSP to generate Payment Links and do automatic reconciliation when a payment is made.
You must update the order status as soon as a payment is made.
## Integration steps
The following sequence diagram shows the typical integration with Payment Links.
![Image](https://scontent-mia5-1.xx.fbcdn.net/v/t39.2365-6/560047558_1339318174593500_8182680878959019679_n.jpg?_nc_cat=104&ccb=1-7&_nc_sid=e280be&_nc_ohc=V-tpMprRB8AQ7kNvwGbWNC_&_nc_oc=AdljOcq2T4kFcbvh-yh8bJQMGN_a-QiiNdsCh8S7AkQ3aRa4tQ1N0QCFd0EfkN4EENo&_nc_zt=14&_nc_ht=scontent-m

## Checkout button templates
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/payments/payments-in/checkout-button-templates/

* * *
Resources
# Checkout button templates
Updated: Dec 12, 2025
Checkout button templates are marketing templates that can showcase one or more products along with corresponding checkout buttons that WhatsApp users can use to make purchases without leaving the WhatsApp client.
![](https://scontent-mia3-3.xx.fbcdn.net/v/t39.2365-6/461864193_1053025166222560_1984323495828319066_n.png?_nc_cat=108&ccb=1-7&_nc_sid=e280be&_nc_ohc=HXF1p_iqr8QQ7kNvwEzsXjs&_nc_oc=Adn4k5XcqcHNJ0s_owwpeZs3FVJcWPg9UIUaNp1xyFYmzqEDGgC41n6u95vL2x6lFIU&_nc_zt=14&_nc_ht=scontent-mia3-3.xx&_nc_gid=T05iximT4-BAn2P3mk3ztQ&oh=00_AfmkfFIQa-8YtfJ8Cmoo48GgY1GnM2YayAumZYGBbBWVUw&oe=6964DBFC)
## Single products
Checkout button templates can show a single product image or video header, along with message body text, message footer, a single checkout button, and up to 9 quick-reply buttons.
![](https://scontent-mia3-3.xx.fbcdn.net/v/t39.2365-6/461716389_980926930508984_4731907095777942335_n.png?_nc_cat=109&ccb=1-7&_nc_sid=e280be&_nc_ohc=BbcYD2XWEEMQ7kNvwHmSmsw&_nc_oc=Adk2AxlGnNy0cAam7MUO9wBKpwmSyJMuQ-t2YvyGffE1EYZjG7OIwUmQR4G59NqoII8&_nc_zt=14&_nc_ht=scontent-mia3-3.xx&_nc_gid=T05iximT4-BAn2P3mk3ztQ&oh=00_AfleHudAujyv2sGTDA

## Enhanced Payment Links
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/payments/payments-in/enhanced-payment-links/

* * *
Resources
# Enhanced Payment Links
Updated: Dec 12, 2025
Your business can enable customers to pay using their favorite UPI apps or other payment methods accepted by supporting Payment Gateways without leaving WhatsApp.
Currently, enhanced payment link experience is supported by major Payment Gateways like **PayU**, **RazorPay** and **Cashfree**.
This feature is not publicly available yet. Please reach out to **whatsappindia-bizpayments-support@meta.com** to know more.
Enhanced payment links experience is enabled for following message types
## Interactive Message Templates
You can continue using templates with existing interactive [components](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/components) with Call-to-Action messages as today and opt-in to the enhanced experience. you can opt-in to the enhanced experience at the time of **creating a template** or at the time **sending an existing template**.
![Image](https://scontent-mia5-1.xx.fbcdn.net/v/t39.2365-6/564690767_1339318147926836_7876647427034457125_n.jpg?_nc_cat=102&ccb=1-7&_nc_sid=e280be&_nc_ohc=JZ1fr87zMo0Q7kNvwFX_vYp&_nc_oc=Adm6NSJ9smCqRiHPF2TvSJBP9piulN47eb9UFtAmYk1m1j3VT973n

## Onboarding APIs
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/payments/payments-in/onboarding-apis/

* * *
Resources
# Onboarding APIs
Updated: Nov 14, 2025
To receive payments on WhatsApp, you must have a payment configuration linked to the corresponding WhatsApp Business Account. Each payment configuration is associated with a unique name. As part of the order\_details message, you can specify the payment configuration to use for a specific checkout.
Onboarding APIs allows you to programatically perform certain operations:
Get all payment configurations linked to a WhatsApp Business Account.
Get a specific payment configuration linked to a WhatsApp Business Account.
Create a payment configuration.
Regenerate payment gateway oauth link to link payment configuration to a payment gateway.
Remove a payment configuration.
## Get All Payment Configurations
Get a list of payment configurations linked to the WhatsApp Business Account.
### Request Syntax
```
GET /<WHATSAPP_BUSINESS_ACCOUNT_ID>/payment_configurations
```
### Sample Request
```
curl 'https://graph.facebook.com/v16.0/102290129340398/payment_configurations' \
-H 'Authorization: Bearer EAAJB...'
```
### Sample Response
```
{
"data": [\
{\
"payment_configurations": [\
{\
"configuration_name": "test-payment-configuration",\
"me

## ## This page isn't available right now
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/payments/payments-in/orderdetailstemplate/

## This page isn't available right now
This may be because of a technical error that we're working to get fixed. Try reloading this page.
Reload Page

## ## This page isn't available right now
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/payments/payments-in/orderstatustemplate/

## This page isn't available right now
This may be because of a technical error that we're working to get fixed. Try reloading this page.
Reload Page

## Payments API — India
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/payments/payments-in/overview/

* * *
Resources
# Payments API — India
Updated: Nov 26, 2025
Payments API enable businesses to accept payments from their customers through all UPI Apps installed on their device and other payment methods like cards, NetBanking, and wallets via WhatsApp.
Businesses can sends invoice (`order_details`) messages to their customers, then get notified about payment status updates via webhook notifications from Payment Gateway.
## Know the differences in the models of integration
The choice between the two models of intergration relies on what Payment Gateway the merchant/business uses. There are 2 models of integration and they differ in the following ways:
**[UPI Intent Mode](https://developers.facebook.com/documentation/business-messaging/whatsapp/payments/payments-in/upi-intent)**: This mode can be used with any Payment Gateway provided they support UPI Intent generation.
**[Payment Gateway Deep Integration Mode](https://developers.facebook.com/documentation/business-messaging/whatsapp/payments/payments-in/pg)**: Currently supported for Razorpay, PayU, Billdesk and Zaakpay only.
| User Experience | UPI Intent Mode | Payment Gateway Deep Integration Mode |
| --- | --- | --- |
| **Nati

## ## This page isn't available right now
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/payments/payments-in/payment-links/

## This page isn't available right now
This may be because of a technical error that we're working to get fixed. Try reloading this page.
Reload Page

## Receive payments via payment gateways on WhatsApp
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/payments/payments-in/pg/

* * *
Resources
# Receive payments via payment gateways on WhatsApp
Updated: Dec 12, 2025
Your business can enable customers to pay for their orders through our partner payment gateways without leaving WhatsApp. Businesses can send customers order\_details messages, then get notified about payment status updates via webhook notifications.
## Overview
Currently, customers browse business catalogs, add products to cart, and send orders with our set of commerce messaging solutions, which includes [Single Product Message, Multi Product Message, and Product Detail Page](https://developers.facebook.com/documentation/business-messaging/whatsapp/catalogs/sell-products-and-services/share-products). Now, with the Payments API, businesses can send customers a _bill_, so the customer can complete their order by paying the business without having to leave WhatsApp.
Our payments solution is currently enabled by BillDesk, Razorpay, PayU and Zaakpay, a third-party payments service provider. You must have a BillDesk, Razorpay, PayU or Zaakpay account in order to receive payments on WhatsApp.
We expect more payment providers to be added in the future.
## How it works
First, the business composes and

## Receive UPI Payments Through WhatsApp
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/payments/payments-in/upi-intent/

* * *
Resources
# Receive UPI Payments Through WhatsApp
Updated: Nov 14, 2025
For businesses working with Razorpay, PayU, Billdesk, Zaakpay payment gateways, we have deeper integration with these PGs. Please refer to [Payment Gateway Integration Guide](https://developers.facebook.com/documentation/business-messaging/whatsapp/payments/payments-in/pg)
Your business can enable customers to pay for their orders using all the UPI Apps installed on their devices via WhatsApp. Businesses can send customers invoice(`order_details`) messages, then get notified about payment status updates via webhook notifications from Payment Gateway.
## Overview
Currently, customers browse business catalogs, add products to cart, and send orders in with our set of commerce messaging solutions, which includes [Single Product Message, Multi Product Message, and Product Detail Page](https://developers.facebook.com/documentation/business-messaging/whatsapp/catalogs/sell-products-and-services/share-products).
With the WhatsApp Payments API, businesses can send customers a bill so the customer can complete their order with all the UPI Apps.
## How It Works
The business must send an `order_details` message for t

## Receive UPI Payments Through WhatsApp(Recommended)
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/payments/payments-in/upi-intent/dynamic-vpa/

* * *
Resources
# Receive UPI Payments Through WhatsApp(Recommended)
Updated: Nov 14, 2025
For businesses working with Razorpay or PayU payment gateways, we have deeper integration with these PGs. Please refer to [Payment Gateway Integration Guide](https://developers.facebook.com/documentation/business-messaging/whatsapp/payments/payments-in/pg)
Your business can enable customers to pay for their orders using all the UPI Apps installed on their devices via WhatsApp. Businesses can send customers invoice (`order_details`) messages, then get notified about payment status updates via webhook notifications from Payment Gateway.
## Overview
Currently, customers browse business catalogs, add products to cart, and send orders in with our set of commerce messaging solutions, which includes [Single Product Message, Multi Product Message, and Product Detail Page](https://developers.facebook.com/documentation/business-messaging/whatsapp/catalogs/sell-products-and-services/share-products).
With the WhatsApp Payments API, businesses can send customers a bill so the customer can complete their order with all the UPI Apps.
## How It Works
The business must send an `order_details` message for the

## Billdesk Payment Gateway Integration Guide
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/payments/payments-in/upi-intent/pg-guide-billdesk/

* * *
Resources
# Billdesk Payment Gateway Integration Guide
Updated: Nov 14, 2025
The purpose of this document is to lay down the payment integration with Billdesk that is required for a merchant, or a Solution Partner, that has implemented a chatbot using WhatsApp Business APIs and needs to accept payments from WhatsApp users.
This document outlines the necessary APIs that must be integrated and how the integration works in conjunction with the WhatsApp Business API integration. While not a comprehensive guide, it serves as a general overview to assist in understanding the payment gateway integration process. Any specific or unique details related to the payment gateway must be determined by the merchant or Solution Partner.
In terms of integrating with the WA P2M product, this document covers the requests and responses highlighted in red in the flow diagram.
![](https://scontent-mia3-3.xx.fbcdn.net/v/t39.2365-6/583839518_1550939386241240_3556025567907244162_n.png?_nc_cat=110&ccb=1-7&_nc_sid=e280be&_nc_ohc=YmLmzScHIlMQ7kNvwFtLFYH&_nc_oc=AdkPyY0KjBsiJNHzBndWCSh9BWJYY72w7PLPfFYicMAg0cjPT2TKNFszj6vEjIf5Deg&_nc_zt=14&_nc_ht=scontent-mia3-3.xx&_nc_gid=fuSwPkPsbr_-rVaK2Xx2cw&oh=00_AflO

## ## This page isn't available right now
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/payments/payments-in/upi-intent/pg-guide-cashfree/

## This page isn't available right now
This may be because of a technical error that we're working to get fixed. Try reloading this page.
Reload Page

## ## This page isn't available right now
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/payments/payments-in/upi-intent/pg-guide-ccavenue/

## This page isn't available right now
This may be because of a technical error that we're working to get fixed. Try reloading this page.
Reload Page

## Permissions
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/permissions/

* * *
Resources
# Permissions
Updated: Nov 5, 2025
Platform endpoints are gated by permissions. References for each endpoint indicated which permissions it requires, but in general, you will need the following:
[whatsapp\_business\_management](https://developers.facebook.com/docs/permissions#whatsapp_business_management) — needed to access metadata on your WhatsApp Business Account, template management, getting business phone numbers associated with your WABA, all analytics, and to receive webhooks notifying you of changes to your Whatsapp Business Account
[whatsapp\_business\_messaging](https://developers.facebook.com/docs/permissions#whatsapp_business_messaging) — needed to send any type of message to a WhatsApp users, and to receive incoming message and message status webhooks
Depending on your business needs, you may also need these permission:
[business\_management](https://developers.facebook.com/docs/permissions#business_management) — only needed if you need to programmatically access your business portfolio (this is rarely needed, since you can access your portfolio using [Meta Business Suite](https://business.facebook.com/).
[whatsapp\_business\_manage\_events](https://dev

## WhatsApp Business Platform Policy Violations
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/policy-enforcement-violations/

* * *
Resources
# WhatsApp Business Platform Policy Violations
Updated: Nov 14, 2025
We are announcing a structured, consistent approach to how the Commerce and Business Policies are enforced on the WhatsApp Business Platform. See this [guide](https://developers.facebook.com/documentation/business-messaging/whatsapp/policy-enforcement) for an overview of how this enforcement system works and the product experience.
The list below outlines specific policy violations a business could receive. We may adjust this list over time. Subscribe to the `account_update` webhooks to get real-time notifications about these policy violations.
| Violation | Description (Click the arrow in the left column for examples, if available) |
| --- | --- |
| `ADULT` | Businesses may not transact in the sale or use of adult products or services. Examples:<br>Products promoting family planning and contraception, which focus on the contraceptive features of the product, and not on sexual pleasure or sexual enhancement<br>Sex toys<br>Videos or live shows for adult entertainment<br>Sexual enhancement products<br>Sexually suggestive services |
| `ALCOHOL` | Businesses may not transact in the sale of alcohol. Exa

## WhatsApp Business Platform policy and spam enforcement
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/policy-enforcement/

* * *
Resources
# WhatsApp Business Platform policy and spam enforcement
Updated: Nov 4, 2025
To maintain high-quality experiences at scale on the WhatsApp Business Platform, WhatsApp will enforce on WhatsApp Business Accounts that repeatedly violate the [WhatsApp Business Messaging Policy](https://l.facebook.com/l.php?u=https%3A%2F%2Fwww.whatsapp.com%2Flegal%2Fbusiness-policy%2F&h=AT3-PLdiXd_y_4FINdZ5ZRJhgdolj2eViBTGnzGe0msZwAhMkZxkNudPj_vXwHDIDw6CC0oGh3JU_XgY1ufztBDDH24isHkra288bATkCuRj7OmLtzWcjXdEIz8DK5J22hiPAOHo9ap4wQ), the [WhatsApp Commerce Policy](https://l.facebook.com/l.php?u=https%3A%2F%2Fwww.whatsapp.com%2Flegal%2Fcommerce-policy%2F&h=AT3-PLdiXd_y_4FINdZ5ZRJhgdolj2eViBTGnzGe0msZwAhMkZxkNudPj_vXwHDIDw6CC0oGh3JU_XgY1ufztBDDH24isHkra288bATkCuRj7OmLtzWcjXdEIz8DK5J22hiPAOHo9ap4wQ), or the [WhatsApp Business Terms of Service](https://l.facebook.com/l.php?u=https%3A%2F%2Fwww.whatsapp.com%2Flegal%2Fbusiness-terms&h=AT3-PLdiXd_y_4FINdZ5ZRJhgdolj2eViBTGnzGe0msZwAhMkZxkNudPj_vXwHDIDw6CC0oGh3JU_XgY1ufztBDDH24isHkra288bATkCuRj7OmLtzWcjXdEIz8DK5J22hiPAOHo9ap4wQ).
The goal of this guide is to educate businesses on how this enforcement system works and the product experience.
This docum

## Pricing on the WhatsApp Business Platform
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/

* * *
Resources
# Pricing on the WhatsApp Business Platform
Updated: Dec 10, 2025
This document explains how pricing works on the WhatsApp Business Platform.
## Cloud API and Marketing Messages API for WhatsApp
To align with industry-standards, effective July 1, 2025, we now charge on a **per-message basis**:
We only charge when a [template message](https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/template-messages) is delivered (`"type":"template"`).
Rates vary based on the template’s [category](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/#message-template-categories) and the recipient WhatsApp phone number’s [country calling code](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/#country-calling-codes).
We provide value to businesses in several ways:
All non-template messages are free (`"type":"text"`, `"type":"image"`, etc.). These can only be sent within an open [customer service window](https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/send-messages#customer-service-windows). See [Sending messages](https://developers.facebook.com/documentati

## Authentication-international rates
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/authentication-international-rates/

* * *
Resources
# Authentication-international rates
Updated: Dec 12, 2025
Specific countries have an **authentication-international** rate in our [rate cards](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing#rate-cards). If you send an authentication template message to a WhatsApp user whose country calling code is for a country that has an authentication-international rate, the delivered message will be billed the country’s authentication–international rate if:
your business is [eligible](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/authentication-international-rates/#eligibility) for authentication-international rates
your business is based in another country (see [Primary Business Location](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/authentication-international-rates/#primary-business-location))
the message was delivered on or after your [start time](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/authentication-international-rates/#start-times) for that country
For example, if your business is based in Indonesia and you send an authenti

## Conversation-based pricing (DEPRECATED)
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/conversation-based-pricing/

* * *
Resources
# Conversation-based pricing (DEPRECATED)
Updated: Nov 14, 2025
Conversation-based pricing is deprecated. It was replaced on July 1, 2025, with [per-message pricing](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing). The document below is for reference purposes only.
This document explains how conversation-based pricing works on the WhatsApp Business Platform.
Charges are applied per conversation, not per individual message sent or received.
Conversations are 24-hour message threads between you and your customers. They are opened and charged when messages you send to customers are delivered. The criteria that determines when a conversation is opened and how it is categorized is explained below.
Businesses are responsible for reviewing the category assigned to their approved templates. Whenever a template is used, a business accepts the charges associated with the category applied to the template at time of use.
## Conversation categories
Conversations are categorized with one of the following categories:
**Marketing** — Enables you to achieve a wide range of goals, from generating awareness to driving sales and retargeting customers.

## QR Codes and Short Links
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/qr-codes/

* * *
Resources
# QR Codes and Short Links
Updated: Oct 31, 2025
WhatsApp QR codes and short links create a digital doorstep for businesses, enabling them to stay connected with their existing customers and connect with new ones. This way, customers can simply scan QR codes with their mobile device camera or type in a short link to begin a chat thread, without needing to input a phone number.
You can view, create, edit and delete QR codes and short links in the [WhatsApp Business Management API](https://developers.facebook.com/documentation/business-messaging/whatsapp/qr-codes) or in the [Business Manager UI](https://www.facebook.com/business/help/890732351439459).
### Limitations
A single WABA phone number cannot be associated with more than 2,000 QR codes and short links.
A QR code scan can initiate a pre-filled message containing up to 140 characters of text.
Analytics are not available for QR Codes and Short Links as we limit the amount of data we log to protect user privacy.
## Create QR code
To create a QR code, send a POST request to the [WhatsApp Business Phone Number > Message Qrdls](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsa

## Meta Graph API - Application Connected Client Businesses
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/application/application-connected-client-businesses

* * *
Resources
# Meta Graph API - Application Connected Client Businesses
Copy for LLM
Version
v23.0
API for retrieving connected client businesses associated with a Meta application.
This endpoint allows applications to retrieve information about businesses that have
established client connections through the application. This is essential for managing
business relationships and understanding client business configurations.
## Base URL
| https://graph.facebook.com |
## Endpoints
| GET | [/{Version}/{Application-ID}/connected\_client\_businesses](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/application/application-connected-client-businesses#get-version-application-id-connected-client-businesses) |
* * *
## GET /{Version}/{Application-ID}/connected\_client\_businesses
Retrieve a list of client businesses connected to the specified application.
Use Cases:
Monitor application-business client relationships
Verify connected business configurations
Retrieve business connection status and details
Manage client business access and permissions
Rate Limiting:
Standard Graph API rate limits apply. Use appropriate retry logic with exponential backoff.
C

## WhatsApp Business Multi-Partner Solutions - Application Solutions API
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/application/application-solutions-api

* * *
Resources
# WhatsApp Business Multi-Partner Solutions - Application Solutions API
Copy for LLM
Version
v23.0
API for retrieving WhatsApp Business Multi-Partner Solutions associated with a specific application.
This endpoint allows applications to query all WhatsApp Business Solutions that they own or
partner with, providing comprehensive information about solution status, permissions, and
configuration details. This is essential for managing solution lifecycle and understanding
current partnership relationships.
## Base URL
| https://graph.facebook.com |
## Endpoints
| GET | [/{Version}/{Application-ID}/whatsapp\_business\_solutions](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/application/application-solutions-api#get-version-application-id-whatsapp-business-solutions) |
* * *
## GET /{Version}/{Application-ID}/whatsapp\_business\_solutions
Retrieve all WhatsApp Business Multi-Partner Solutions associated with the specified application.
This includes both solutions owned by the application and solutions where the application
acts as a partner.
Use Cases:
Retrieve all solutions for an application's portfolio management
Filter solutions b

## ## This page isn't available right now
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/application/solution-creation-api

## This page isn't available right now
This may be because of a technical error that we're working to get fixed. Try reloading this page.
Reload Page

## WhatsApp Business Management - Add Phone Numbers API
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/business/add-phone-numbers-api

* * *
Resources
# WhatsApp Business Management - Add Phone Numbers API
Copy for LLM
Version
v23.0
API for adding phone numbers to a WhatsApp Business Account.
This endpoint allows businesses to add phone numbers to their WhatsApp Business Account
for messaging purposes.
## Base URL
| https://graph.facebook.com |
## Endpoints
| POST | [/{Version}/{Business-ID}/add\_phone\_numbers](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/business/add-phone-numbers-api#post-version-business-id-add-phone-numbers) |
* * *
## POST /{Version}/{Business-ID}/add\_phone\_numbers
Add a preverified phone number to a WhatsApp Business Account. This endpoint is used by
Partners to create a pool of Partner owned numbers that end clients
can purchase.
Use Cases:
Add new phone numbers to scale messaging operations
Set up phone numbers for different business locations
Manage phone number inventory for business messaging
Configure phone numbers for specific messaging workflows
Rate Limiting:
Standard Graph API rate limits apply. Use appropriate retry logic with exponential backoff.
Phone Number Requirements:
Must be in E.164 format (e.g., +1234567890)
Must not be already re

## WhatsApp Cloud API - Business Account API
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/business/business-account-api

* * *
Resources
# WhatsApp Cloud API - Business Account API
Copy for LLM
Version
v23.0
Retrieve Meta Business Portfolio information by Business ID.
Returns business name, timezone, and other account details
for managing WhatsApp Business Account configurations.
## Base URL
| https://graph.facebook.com |
## Endpoints
| GET | [/{Version}/{Business-ID}](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/business/business-account-api#get-version-business-id) |
* * *
## GET /{Version}/{Business-ID}
Endpoint reference: [Business](https://developers.facebook.com/docs/marketing-api/reference/business/)
### Request Syntax
**GET**/{Version}/{Business-ID}
Select language
cURLJavaScriptPython
* * *
```
curl --request GET \
--url 'https://graph.facebook.com/{Version}/{Business-ID}' \
--header 'Authorization: Bearer <Token>' \
--header 'Content-Type: application/json' \
--data '{}'
```
Select status code
200
* * *
```
{
"Example response": {
"value": {
"id": "506914307656634",
"name": "Lucky Shrub",
"timezone_id": 0
}
```
Header Parameters
* * *
User-Agentstring
The user agent string identifying the client software making the request.
Authorizationstring·required

## WhatsApp Business Platform - Client WhatsApp Business Accounts API
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/business/client-whatsapp-business-accounts-api

* * *
Resources
# WhatsApp Business Platform - Client WhatsApp Business Accounts API
Copy for LLM
Version
v23.0
API for retrieving client WhatsApp Business Accounts (WABAs) shared with a business.
This endpoint allows businesses to retrieve information about WhatsApp Business Accounts
that have been shared with them by other businesses or solution partners.
## Base URL
| https://graph.facebook.com |
## Endpoints
| GET | [/{Version}/{Business-ID}/client\_whatsapp\_business\_accounts](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/business/client-whatsapp-business-accounts-api#get-version-business-id-client-whatsapp-business-accounts) |
* * *
## GET /{Version}/{Business-ID}/client\_whatsapp\_business\_accounts
Retrieve a list of WhatsApp Business Accounts that have been shared with the specified business.
Use Cases:
Monitor shared WABA relationships and permissions
Verify WABA configuration and status information
Retrieve WABA details for business integrations
Manage multi-business WhatsApp messaging setups
Rate Limiting:
Standard Graph API rate limits apply. Use appropriate retry logic with exponential backoff.
Caching:
WABA information can be ca

## WhatsApp Business Management API - Owned WhatsApp Business Accounts
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/business/owned-whatsapp-business-accounts

* * *
Resources
# WhatsApp Business Management API - Owned WhatsApp Business Accounts
Copy for LLM
Version
v23.0
API for retrieving WhatsApp Business Accounts owned by a specific business.
This endpoint allows businesses to retrieve comprehensive information about their
owned WhatsApp Business Accounts, including account details, status, and configuration.
## Base URL
| https://graph.facebook.com |
## Endpoints
| GET | [/{Version}/{Business-ID}/owned\_whatsapp\_business\_accounts](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/business/owned-whatsapp-business-accounts#get-version-business-id-owned-whatsapp-business-accounts) |
* * *
## GET /{Version}/{Business-ID}/owned\_whatsapp\_business\_accounts
Retrieve WhatsApp Business Accounts owned by the specified business. This endpoint
provides comprehensive information about all WABAs owned by the business, including
account details, configuration, and status information.
Use Cases:
Retrieve all WhatsApp Business Accounts owned by a business
Filter accounts by business type
Find specific accounts by ID
Monitor business portfolio of WhatsApp Business Accounts
Manage account access and permissions acr

## WhatsApp Business Accounts API
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/business/whatsapp-business-accounts-api

* * *
Resources
# WhatsApp Business Accounts API
Copy for LLM
Version
v23.0
API for managing WhatsApp Business Accounts under a business portfolio.
This endpoint allows businesses to retrieve and create WhatsApp Business Accounts (WABAs)
for messaging and business communication purposes. WABAs can be associated
with the specified business portfolio and configured with the provided parameters.
## Base URL
| https://graph.facebook.com |
## Endpoints
| GET | [/{Version}/{Business-ID}/whatsapp\_business\_accounts](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/business/whatsapp-business-accounts-api#get-version-business-id-whatsapp-business-accounts) |
| POST | [/{Version}/{Business-ID}/whatsapp\_business\_accounts](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/business/whatsapp-business-accounts-api#post-version-business-id-whatsapp-business-accounts) |
* * *
## GET /{Version}/{Business-ID}/whatsapp\_business\_accounts
Retrieve a list of WhatsApp Business Accounts owned by the specified business portfolio.
This endpoint provides information about WhatsApp Business Accounts that are owned
by the business, includ

## WhatsApp Business Partner Onboarding to MM Lite API
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/business/whatsapp-business-partner-onboarding-to-mm-lite-api

* * *
Resources
# WhatsApp Business Partner Onboarding to MM Lite API
Copy for LLM
Version
v23.0
API for onboarding partners to WhatsApp Business MM Lite partnerships.
This endpoint enables solution partners to initiate MM Lite onboarding requests to end businesses.
The API validates eligibility, creates business agreement requests, and automatically configures
OBO (On Behalf Of) WABA mobility intents for eligible WhatsApp Business Accounts.
Core Functionality:
Validates partner business and application ownership
Checks end business eligibility for MM Lite partnerships
Identifies eligible shared WABAs and OBO WABAs associated with the partnership
Automatically sets mobility intents on eligible OBO WABAs (BSPs only)
Creates a business agreement request with MM\_LITE\_ONBOARDING type
Returns a unique request ID for tracking the onboarding process
## Base URL
| https://graph.facebook.com |
## Endpoints
| POST | [/{Version}/{Business-ID}/onboard\_partners\_to\_mm\_lite](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/business/whatsapp-business-partner-onboarding-to-mm-lite-api#post-version-business-id-onboard-partners-to-mm-lite) |
* * *
## POST /{Ve

## WhatsApp Business Pre-Verified Phone Number Sharing API
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/business/whatsapp-business-pre-verified-phone-number-sharing-api

* * *
Resources
# WhatsApp Business Pre-Verified Phone Number Sharing API
Copy for LLM
Version
v23.0
API for sharing WhatsApp Business Pre-Verified Phone Numbers between business entities,
enabling collaborative phone number management and partnership workflows.
This endpoint allows authorized businesses to share pre-verified phone numbers with
partner businesses, facilitating multi-business WhatsApp integrations while maintaining
proper access controls and ownership boundaries. Shared phone numbers can be used by
partner businesses for WhatsApp Business messaging operations.
## Base URL
| https://graph.facebook.com |
## Endpoints
| POST | [/{Version}/{Business-ID}/share\_preverified\_numbers](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/business/whatsapp-business-pre-verified-phone-number-sharing-api#post-version-business-id-share-preverified-numbers) |
* * *
## POST /{Version}/{Business-ID}/share\_preverified\_numbers
Share a pre-verified phone number with another business entity, granting specified
permissions for collaborative WhatsApp Business messaging operations.
Use Cases:
Enable partner businesses to use your pre-verified phone number

## ## This page isn't available right now
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/business/whatsapp-business-pre-verified-phone-numbers-api

## This page isn't available right now
This may be because of a technical error that we're working to get fixed. Try reloading this page.
Reload Page

## WhatsApp Business Cloud API - Groups Invite Link API
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/groups/groups-invite-link-api

* * *
Resources
# WhatsApp Business Cloud API - Groups Invite Link API
Copy for LLM
Version
v23.0
The Groups API gives you simple functions to control groups through their lifecycle.
When you create a new group, an invite link is created for inviting participants to the group.
Since you cannot manually add participants to the group, simply send a message with your invite link to WhatsApp users who you would like to join the group.
## Base URL
| https://graph.facebook.com |
## Endpoints
| POST | [/{Version}/{group\_id}/invite\_link](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/groups/groups-invite-link-api#post-version-group-id-invite-link) |
| DELETE | [/{Version}/{group\_id}/invite\_link](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/groups/groups-invite-link-api#delete-version-group-id-invite-link) |
* * *
## POST /{Version}/{group\_id}/invite\_link
Create a new group invite link
### Request Syntax
**POST**/{Version}/{group\_id}/invite\_link
Select language
cURLJavaScriptPython
* * *
```
curl --request POST \
--url 'https://graph.facebook.com/{Version}/{group_id}/invite_link' \
--header 'Authorization: B

## ## This page isn't available right now
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/groups/groups-join-requests-api

## This page isn't available right now
This may be because of a technical error that we're working to get fixed. Try reloading this page.
Reload Page

## WhatsApp Business Cloud API - Groups Participants API
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/groups/groups-participants-api

* * *
Resources
# WhatsApp Business Cloud API - Groups Participants API
Copy for LLM
Version
v23.0
The Groups API gives you simple functions to control groups through their lifecycle.
When you create a new group, an invite link is created for inviting participants to the group.
Since you cannot manually add participants to the group, simply send a message with your invite link to WhatsApp users who you would like to join the group.
## Base URL
| https://graph.facebook.com |
## Endpoints
| POST | [/{Version}/{group\_id}/participants](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/groups/groups-participants-api#post-version-group-id-participants) |
| DELETE | [/{Version}/{group\_id}/participants](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/groups/groups-participants-api#delete-version-group-id-participants) |
* * *
## POST /{Version}/{group\_id}/participants
Add participants to group
### Request Syntax
**POST**/{Version}/{group\_id}/participants
Select language
cURLJavaScriptPython
* * *
```
curl --request POST \
--url 'https://graph.facebook.com/{Version}/{group_id}/participants' \
--header 'Authorization:

## WhatsApp Business Cloud API - Groups Query API
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/groups/groups-query-api

* * *
Resources
# WhatsApp Business Cloud API - Groups Query API
Copy for LLM
Version
v23.0
The Groups API gives you simple functions to control groups through their lifecycle.
When you create a new group, an invite link is created for inviting participants to the group.
Since you cannot manually add participants to the group, simply send a message with your invite link to WhatsApp users who you would like to join the group.
## Base URL
| https://graph.facebook.com |
## Endpoints
| GET | [/{Version}/{group\_id}](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/groups/groups-query-api#get-version-group-id) |
| POST | [/{Version}/{group\_id}](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/groups/groups-query-api#post-version-group-id) |
| DELETE | [/{Version}/{group\_id}](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/groups/groups-query-api#delete-version-group-id) |
* * *
## GET /{Version}/{group\_id}
Retrieve metadata about a single group
### Request Syntax
**GET**/{Version}/{group\_id}
Try it
Select language
cURLJavaScriptPython
* * *
```
curl --request GET \
--url 'https:

## WhatsApp Cloud API - Media API
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/media/media-api

* * *
Resources
# WhatsApp Cloud API - Media API
Copy for LLM
Version
v23.0
Retrieve and delete uploaded media files by media ID.
Get media URLs with file metadata including size, MIME type, and SHA256 hash.
Media URLs are valid for 5 minutes after retrieval.
## Base URL
| https://graph.facebook.com |
## Endpoints
| GET | [/{Version}/{Media-ID}](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/media/media-api#get-version-media-id) |
| DELETE | [/{Version}/{Media-ID}](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/media/media-api#delete-version-media-id) |
* * *
## GET /{Version}/{Media-ID}
To retrieve your media’s URL, make a GET call to /{{Media-ID}}. Use the returned URL to download the media file. Note that clicking this URL (i.e. performing a generic GET) will not return the media; you must include an access token. For more information, see [Download Media](https://developers.facebook.com/docs/business-messaging/whatsapp/business-phone-numbers/media#download-media).
You can also use the optional query ?phone\_number\_id for Retrieve Media URL and Delete Media. This parameter checks to make sure the media be

## WhatsApp Cloud API - Media Download API
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/media/media-download-api

* * *
Resources
# WhatsApp Cloud API - Media Download API
Copy for LLM
Version
v23.0
Download media files using URLs obtained from media retrieval endpoints.
Returns binary media content with appropriate MIME type headers.
Media URLs expire after 5 minutes and must be re-retrieved if expired.
## Base URL
| https://graph.facebook.com |
## Endpoints
| GET | [/{Version}/{Media-URL}](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/media/media-download-api#get-version-media-url) |
* * *
## GET /{Version}/{Media-URL}
Download media files using URLs obtained from media retrieval endpoints.
Requires User Access Token with whatsapp\_business\_messaging permission.
Media URLs expire after 5 minutes and must be re-retrieved if expired.
Returns binary content with appropriate MIME type headers.
### Request Syntax
**GET**/{Version}/{Media-URL}
Try it
Select language
cURLJavaScriptPython
* * *
```
curl --request GET \
--url 'https://graph.facebook.com/{Version}/{Media-URL}' \
--header 'Authorization: Bearer <Token>' \
--header 'Content-Type: application/json' \
--data '{}'
```
Select status code
200
* * *
```
{
"Download Media": {
"value": ""
}
```
Header Para

## WhatsApp Business Message History Events API
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/message-history/whatsapp-business-message-history-events-api

* * *
Resources
# WhatsApp Business Message History Events API
Copy for LLM
Version
v23.0
API for retrieving WhatsApp Business Message History Events and delivery status occurrences.
This endpoint allows businesses to retrieve detailed message delivery status events
for specific message history entries, including delivery status transitions,
timestamps, and application information.
## Base URL
| https://graph.facebook.com |
## Endpoints
| GET | [/{Version}/{Message-History-ID}/events](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/message-history/whatsapp-business-message-history-events-api#get-version-message-history-id-events) |
* * *
## GET /{Version}/{Message-History-ID}/events
Retrieve paginated message delivery status events for a specific message history entry,
including delivery status occurrences, timestamps, and application information.
Use Cases:
Track detailed message delivery status events and transitions
Monitor delivery status occurrence timestamps
Retrieve application information for delivery events
Debug message delivery issues and status changes
Rate Limiting:
Standard Graph API rate limits apply. Use appropriate retry logic wi

## WhatsApp Business - Assigned WhatsApp Business Accounts API
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/user/assigned-whatsapp-business-accounts-api

* * *
Resources
# WhatsApp Business - Assigned WhatsApp Business Accounts API
Copy for LLM
Version
v23.0
API for retrieving WhatsApp Business Accounts that have been assigned to a specific user.
This endpoint allows apps to retrieve WhatsApp Business Accounts that are assigned to
specific users.
## Base URL
| https://graph.facebook.com |
## Endpoints
| GET | [/{Version}/{User-ID}/assigned\_whatsapp\_business\_accounts](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/user/assigned-whatsapp-business-accounts-api#get-version-user-id-assigned-whatsapp-business-accounts) |
* * *
## GET /{Version}/{User-ID}/assigned\_whatsapp\_business\_accounts
Retrieve WhatsApp Business Accounts that have been assigned to a specific user.
This endpoint provides information about account assignments, permissions, and
current status corresponding to the GraphAssignedWhatsAppBusinessAccountsEdge node.
Use Cases:
Retrieve all WhatsApp Business Accounts assigned to a user
Check user permissions for specific accounts
Monitor account assignment status and changes
Validate user access before performing business operations
Rate Limiting:
Standard Graph API rate limits apply.

## WhatsApp Incoming Webhook Payload
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/webhooks/whatsapp-incoming-webhook-payload

* * *
Resources
# WhatsApp Incoming Webhook Payload
Copy for LLM
Version
v23.0
Schemas for incoming WhatsApp webhook notifications.
Defines payload structures for messages, status updates, and user interactions
sent from WhatsApp users to businesses via webhooks.
## Base URL
## Endpoints
| POST | [/whatsapp/webhooks](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/webhooks/whatsapp-incoming-webhook-payload#post-whatsapp-webhooks) |
* * *
## POST /whatsapp/webhooks
Endpoint for receiving webhook payloads for diverse incoming WhatsApp message types.
### Request Syntax
**POST**/whatsapp/webhooks
Select language
cURLJavaScriptPython
* * *
```
curl --request POST \
--url 'https://graph.facebook.com/whatsapp/webhooks' \
--header 'Authorization: Bearer <Token>' \
--header 'Content-Type: application/json' \
--data '{
"object": "whatsapp_business_account",
"entry": [\
{\
"id": "419561257915477",\
"changes": [\
{\
"value": {\
"messaging_product": "whatsapp",\
"metadata": {\
"display_phone_number": "15550783881",\
"phone_number_id": "106540352242922"\
},\
"contacts": [\
{\
"profile": {\
"name": "Sheena Nelson"\
},\
"wa_id": "16505551234"\
}\
],\
"messages":

## WhatsApp Business API - WhatsApp Account Number API
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-account-number/whatsapp-account-number-api

* * *
Resources
# WhatsApp Business API - WhatsApp Account Number API
Copy for LLM
Version
v23.0
API for retrieving WhatsApp Account Number details and configuration information.
This endpoint allows businesses to retrieve comprehensive information about their
WhatsApp Account Numbers, including status, verification details, and configuration settings.
## Base URL
| https://graph.facebook.com |
## Endpoints
| GET | [/{Version}/{WhatsApp-Account-Number-ID}](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-account-number/whatsapp-account-number-api#get-version-whatsapp-account-number-id) |
* * *
## GET /{Version}/{WhatsApp-Account-Number-ID}
Retrieve comprehensive details about a WhatsApp Account Number, including its current status,
verification information, quality rating, and configuration settings.
Use Cases:
Monitor account number status and quality rating
Verify account number configuration before messaging operations
Check verification and approval status
Retrieve display name and business profile information
Rate Limiting:
Standard Graph API rate limits apply. Use appropriate retry logic with exponential backoff.
Caching:
Account nu

## WhatsApp Business Account - Migration Intent Details API
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-account-migration-intent/migration-intent-details-api

* * *
Resources
# WhatsApp Business Account - Migration Intent Details API
Copy for LLM
Version
v23.0
API for retrieving WhatsApp Business Account migration intent details and status information.
This endpoint allows solution partners to retrieve comprehensive information about their
WhatsApp Business Account migration intents, including current status and migration details.
## Base URL
| https://graph.facebook.com |
## Endpoints
| GET | [/{Version}/{Migration-Intent-ID}](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-account-migration-intent/migration-intent-details-api#get-version-migration-intent-id) |
* * *
## GET /{Version}/{Migration-Intent-ID}
Retrieve comprehensive details about a WhatsApp Business Account migration intent,
including its current status and migration information.
Use Cases:
Monitor migration intent lifecycle and status changes
Verify migration intent configuration and current state
Check migration progress and completion status
Retrieve migration intent details for business workflows
Rate Limiting:
Standard Graph API rate limits apply. Use appropriate retry logic with exponential backoff.
Caching:
Migrat

## WhatsApp Business Account - Assigned Users Management API
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-account/assigned-users-management-api

* * *
Resources
# WhatsApp Business Account - Assigned Users Management API
Copy for LLM
Version
v23.0
API for managing user assignments and permissions for WhatsApp Business Accounts.
This endpoint allows businesses to manage user access to their WhatsApp Business Accounts,
including listing assigned users, adding users with specific permissions, and removing user access.
## Base URL
| https://graph.facebook.com |
## Endpoints
| GET | [/{Version}/{WhatsApp-Business-Account-ID}/assigned\_users](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-account/assigned-users-management-api#get-version-whatsapp-business-account-id-assigned-users) |
| POST | [/{Version}/{WhatsApp-Business-Account-ID}/assigned\_users](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-account/assigned-users-management-api#post-version-whatsapp-business-account-id-assigned-users) |
| DELETE | [/{Version}/{WhatsApp-Business-Account-ID}/assigned\_users](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-account/assigned-users-management-api#delete-version-whatsa

## WhatsApp Business Account - Conversational Automation API
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-account/conversational-automation-api

* * *
Resources
# WhatsApp Business Account - Conversational Automation API
Copy for LLM
Version
v23.0
API for managing conversational automation settings for WhatsApp Business Account phone numbers.
This endpoint allows businesses to configure automated conversation features including
welcome messages, conversation prompts (ice breakers), and bot commands for their
WhatsApp Business phone numbers.
## Base URL
| https://graph.facebook.com |
## Endpoints
| POST | [/{Version}/{Phone-Number-ID}/conversational\_automation](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-account/conversational-automation-api#post-version-phone-number-id-conversational-automation) |
* * *
## POST /{Version}/{Phone-Number-ID}/conversational\_automation
Configure conversational automation settings for a WhatsApp Business Account phone number,
including welcome messages, conversation prompts (ice breakers), and bot commands.
Use Cases:
Set up automated welcome messages for new customer conversations
Configure conversation prompts to guide customer interactions
Define bot commands for common customer service scenarios
Update existing automation settings
E

## WhatsApp Cloud API - Extended Credits API
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-account/extended-credits-api

* * *
Resources
# WhatsApp Cloud API - Extended Credits API
Copy for LLM
Version
v23.0
Retrieve extended credit line information for WhatsApp Business Accounts.
Returns credit line IDs and associated legal entity names
for billing and payment management.
## Base URL
| https://graph.facebook.com |
## Endpoints
| GET | [/{Version}/{Business-ID}/extendedcredits](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-account/extended-credits-api#get-version-business-id-extendedcredits) |
* * *
## GET /{Version}/{Business-ID}/extendedcredits
Endpoint reference: [Business > Extendedcredits](https://developers.facebook.com/docs/marketing-api/reference/extended-credit/)
### Request Syntax
**GET**/{Version}/{Business-ID}/extendedcredits
Select language
cURLJavaScriptPython
* * *
```
curl --request GET \
--url 'https://graph.facebook.com/{Version}/{Business-ID}/extendedcredits' \
--header 'Authorization: Bearer <Token>' \
--header 'Content-Type: application/json' \
--data '{}'
```
Select status code
200
* * *
```
{
"Example response": {
"value": {
"data": [\
{\
"id": "1972385232742146",\
"legal_entity_name": "Lucky Shrub"\
}\
]
}
```
Header Para

## WhatsApp Business API - Phone Number Management API
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-account/phone-number-management-api

* * *
Resources
# WhatsApp Business API - Phone Number Management API
Copy for LLM
Version
v23.0
API for managing WhatsApp Business Account phone numbers, including retrieving phone number details
and creating new phone number registrations within a WhatsApp Business Account.
## Base URL
| https://graph.facebook.com |
## Endpoints
| GET | [/{Version}/{WABA-ID}/phone\_numbers](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-account/phone-number-management-api#get-version-waba-id-phone-numbers) |
| POST | [/{Version}/{WABA-ID}/phone\_numbers](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-account/phone-number-management-api#post-version-waba-id-phone-numbers) |
* * *
## GET /{Version}/{WABA-ID}/phone\_numbers
Retrieve all phone numbers associated with a WhatsApp Business Account, including their
status, verification details, and configuration information.
Use Cases:
List all phone numbers in a WhatsApp Business Account
Monitor phone number status and verification progress
Check phone number quality ratings and messaging limits
Retrieve phone number configuration details
Filter

## WhatsApp Business Account - Schedules API
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-account/schedules-api

* * *
Resources
# WhatsApp Business Account - Schedules API
Copy for LLM
Version
v23.0
API for managing WhatsApp Business Account schedules and scheduling configurations.
This endpoint allows businesses to manage scheduling functionality for their WhatsApp Business Account,
including retrieving existing schedules and creating new scheduling configurations for automated messaging,
business hours, and other time-based operations.
## Base URL
| https://graph.facebook.com |
## Endpoints
| GET | [/{Version}/{WABA-ID}/schedules](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-account/schedules-api#get-version-waba-id-schedules) |
| POST | [/{Version}/{WABA-ID}/schedules](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-account/schedules-api#post-version-waba-id-schedules) |
* * *
## GET /{Version}/{WABA-ID}/schedules
Retrieve all schedules associated with a WhatsApp Business Account, including their
configuration, status, and execution details.
Use Cases:
List all schedules in a WhatsApp Business Account
Monitor schedule status and performance
Check schedule configuration and timing

## WhatsApp Business Account - Subscribed Apps API
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-account/subscribed-apps-api

* * *
Resources
# WhatsApp Business Account - Subscribed Apps API
Copy for LLM
Version
v23.0
API for managing app subscriptions to WhatsApp Business Account webhooks and retrieving
subscription details. This endpoint allows apps to subscribe to, unsubscribe from, and
query webhook subscriptions for WhatsApp Business Accounts.
## Base URL
| https://graph.facebook.com |
## Endpoints
| GET | [/{Version}/{WABA-ID}/subscribed\_apps](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-account/subscribed-apps-api#get-version-waba-id-subscribed-apps) |
| POST | [/{Version}/{WABA-ID}/subscribed\_apps](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-account/subscribed-apps-api#post-version-waba-id-subscribed-apps) |
| DELETE | [/{Version}/{WABA-ID}/subscribed\_apps](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-account/subscribed-apps-api#delete-version-waba-id-subscribed-apps) |
* * *
## GET /{Version}/{WABA-ID}/subscribed\_apps
Retrieve a list of all applications currently subscribed to webhook events
for the specified WhatsApp Busi

## WhatsApp Cloud API - Template API
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-account/template-api

* * *
Resources
# WhatsApp Cloud API - Template API
Copy for LLM
Version
v23.0
Create, retrieve, update, and delete message templates.
Manage pre-approved message formats for business-initiated conversations.
Includes template submission, localization, and quality score metrics.
## Base URL
| https://graph.facebook.com |
## Endpoints
| GET | [/{Version}/{TEMPLATE\_ID}](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-account/template-api#get-version-template-id) |
| POST | [/{Version}/{TEMPLATE\_ID}](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-account/template-api#post-version-template-id) |
| GET | [/{Version}/{WABA-ID}/message\_templates](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-account/template-api#get-version-waba-id-message-templates) |
| POST | [/{Version}/{WABA-ID}/message\_templates](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-account/template-api#post-version-waba-id-message-templates) |
| DELETE | [/{Version}/{WABA-ID}/message\_templates](https:/

## WhatsApp Business Account Activities API
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-account/whatsapp-business-account-activities-api

* * *
Resources
# WhatsApp Business Account Activities API
Copy for LLM
Version
v23.0
API for retrieving WhatsApp Business Account activity logs and audit trails.
This endpoint allows businesses to monitor and track activities performed on their
WhatsApp Business Account, including administrative actions, configuration changes,
and operational events. This is essential for compliance, auditing, and monitoring
business account usage.
## Base URL
| https://graph.facebook.com |
## Endpoints
| GET | [/{Version}/{WABA-ID}/activities](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-account/whatsapp-business-account-activities-api#get-version-waba-id-activities) |
* * *
## GET /{Version}/{WABA-ID}/activities
Retrieve activity logs and audit trails for a WhatsApp Business Account.
This endpoint returns a chronological list of activities performed on the account,
including administrative actions, configuration changes, and operational events.
Use Cases:
Monitor account configuration changes and administrative actions
Generate compliance and audit reports for regulatory requirements
Track user activities and permission modifications
Inves

## ## This page isn't available right now
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-account/whatsapp-business-account-api

## This page isn't available right now
This may be because of a technical error that we're working to get fixed. Try reloading this page.
Reload Page

## WhatsApp Business Account Solutions List API
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-account/whatsapp-business-account-solutions-list-api

* * *
Resources
# WhatsApp Business Account Solutions List API
Copy for LLM
Version
v23.0
API for retrieving Multi-Partner Solutions associated with a WhatsApp Business Account (WABA).
This endpoint allows authorized applications to retrieve a list of Multi-Partner Solutions
that are associated with a specific WhatsApp Business Account.
## Base URL
| https://graph.facebook.com |
## Endpoints
| GET | [/{Version}/{WABA-ID}/solutions](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-account/whatsapp-business-account-solutions-list-api#get-version-waba-id-solutions) |
* * *
## GET /{Version}/{WABA-ID}/solutions
Retrieve a paginated list of Multi-Partner Solutions associated with the specified
WhatsApp Business Account. This endpoint supports field selection and cursor-based
pagination for efficient data retrieval.
Use Cases:
Discover available Multi-Partner Solutions for business onboarding
Monitor solution status and availability across your WABA
Retrieve solution ownership and permission details
Filter solutions by specific fields or status requirements
Rate Limiting:
Standard Graph API rate limits apply. Use appropriate retry logi

## WhatsApp Business Bot - Bot Details API
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-bot/bot-details-api

* * *
Resources
# WhatsApp Business Bot - Bot Details API
Copy for LLM
Version
v23.0
This endpoint allows developers to retrieve comprehensive information about their
WhatsApp Business Bot, including prompts, commands, and welcome message settings.
This is essential for managing bot configuration and understanding current bot state.
## Base URL
| https://graph.facebook.com |
## Endpoints
| GET | [/{Version}/{WABA-Bot-ID}](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-bot/bot-details-api#get-version-waba-bot-id) |
* * *
## GET /{Version}/{WABA-Bot-ID}
Retrieve comprehensive details about a WhatsApp Business Bot, including its prompts,
commands, and welcome message configuration.
Use Cases:
Retrieve bot configuration and automated response settings
Monitor available bot commands and their descriptions
Check welcome message enablement status
Validate bot state before implementing automation
Audit bot configuration for business compliance
Rate Limiting:
Standard Graph API rate limits apply. Use appropriate retry logic with exponential backoff.
Caching:
Bot details can be cached for moderate periods, but configuration may change
wh

## WhatsApp Cloud API - Block API
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-phone-number/block-api

* * *
Resources
# WhatsApp Cloud API - Block API
Copy for LLM
Version
v23.0
The Block API allows businesses to manage blocked users on WhatsApp.
Use this API to block users from sending messages to your business number,
retrieve the list of blocked users, and unblock users when needed.
For more information, see the [Block Users Guide](https://developers.facebook.com/docs/business-messaging/whatsapp/block-users).
## Base URL
| https://graph.facebook.com |
## Endpoints
| GET | [/{Version}/{Phone-Number-ID}/block\_users](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-phone-number/block-api#get-version-phone-number-id-block-users) |
| POST | [/{Version}/{Phone-Number-ID}/block\_users](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-phone-number/block-api#post-version-phone-number-id-block-users) |
| DELETE | [/{Version}/{Phone-Number-ID}/block\_users](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-phone-number/block-api#delete-version-phone-number-id-block-users) |
* * *
## GET /{Version}/{Phone-Number-ID}/block\_users
Guide

## WhatsApp Business Cloud API - Business Compliance Information API
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-phone-number/business-compliance-information-api

* * *
Resources
# WhatsApp Business Cloud API - Business Compliance Information API
Copy for LLM
Version
v23.0
Retrieve WhatsApp Business Account compliance information for regulatory requirements.
Returns business entity details, registration status, and contact information
for grievance officers and customer care (primarily for India-based businesses).
This endpoint allows businesses to retrieve comprehensive compliance information including entity
details, registration status, and required contact information for regulatory compliance purposes.
## Base URL
| https://graph.facebook.com |
## Endpoints
| GET | [/{Version}/{Phone-Number-ID}/business\_compliance\_info](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-phone-number/business-compliance-information-api#get-version-phone-number-id-business-compliance-info) |
| POST | [/{Version}/{Phone-Number-ID}/business\_compliance\_info](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-phone-number/business-compliance-information-api#post-version-phone-number-id-business-compliance-info) |
* * *
## GET /{Version}/{Phone-Number-ID}/

## ## This page isn't available right now
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-phone-number/business-encryption-api

## This page isn't available right now
This may be because of a technical error that we're working to get fixed. Try reloading this page.
Reload Page

## ## This page isn't available right now
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-phone-number/calling-api

## This page isn't available right now
This may be because of a technical error that we're working to get fixed. Try reloading this page.
Reload Page

## WhatsApp Cloud API - Commerce Settings API
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-phone-number/commerce-settings-api

* * *
Resources
# WhatsApp Cloud API - Commerce Settings API
Copy for LLM
Version
v23.0
Configure WhatsApp Business commerce settings including catalog visibility
and shopping cart enablement. Retrieve and update commerce configurations
for business phone numbers.
## Base URL
| https://graph.facebook.com |
## Endpoints
| GET | [/{Version}/{Phone-Number-ID}/whatsapp\_commerce\_settings](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-phone-number/commerce-settings-api#get-version-phone-number-id-whatsapp-commerce-settings) |
| POST | [/{Version}/{Phone-Number-ID}/whatsapp\_commerce\_settings](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-phone-number/commerce-settings-api#post-version-phone-number-id-whatsapp-commerce-settings) |
* * *
## GET /{Version}/{Phone-Number-ID}/whatsapp\_commerce\_settings
Guide: [Sell Products & Services](https://developers.facebook.com/docs/business-messaging/whatsapp/catalogs/sell-products-and-services) (Cloud API)
Guide: [Sell Products & Services](https://developers.facebook.com/docs/whatsapp/on-premises/guides/commerce-guides) (On-Premises API

## WhatsApp Cloud API - Encrypted Messages API
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-phone-number/encrypted-messages-api

* * *
Resources
# WhatsApp Cloud API - Encrypted Messages API
Copy for LLM
Version
v23.0
Send encrypted messages using JWE (JSON Web Encryption) format.
Adds payload-level encryption on top of TLS/SSL for enhanced security.
Supports A128GCM/A256GCM content encryption and RSA-OAEP key encryption.
## Base URL
| https://graph.facebook.com |
## Endpoints
| POST | [/{Version}/{Phone-Number-ID}/messages\_encrypted](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-phone-number/encrypted-messages-api#post-version-phone-number-id-messages-encrypted) |
* * *
## POST /{Version}/{Phone-Number-ID}/messages\_encrypted
Send encrypted messages using JWE (JSON Web Encryption) format. This endpoint provides an additional layer of security on top of existing standard TLS/SSL by accepting pre-encrypted message payloads and returning encrypted responses.
Important Notes:
Only successful responses will be encrypted
Error responses will be returned unencrypted if the underlying JSON is incorrectly formatted
Payload encryption must be enabled for the phone number using the POST /<WABA\_ID>/settings endpoint
The encrypted payload must follow the same str

## WhatsApp Business Cloud API - Groups Management API
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-phone-number/groups-management-api

* * *
Resources
# WhatsApp Business Cloud API - Groups Management API
Copy for LLM
Version
v23.0
Create and manage WhatsApp Business groups with approval settings.
Returns invite links for adding participants to groups.
Retrieve active group lists with pagination support.
## Base URL
| https://graph.facebook.com |
## Endpoints
| GET | [/{Version}/{Phone-Number-ID}/groups](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-phone-number/groups-management-api#get-version-phone-number-id-groups) |
| POST | [/{Version}/{Phone-Number-ID}/groups](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-phone-number/groups-management-api#post-version-phone-number-id-groups) |
* * *
## GET /{Version}/{Phone-Number-ID}/groups
Retrieve a list of active groups for a given business phone number
### Request Syntax
**GET**/{Version}/{Phone-Number-ID}/groups
Select language
cURLJavaScriptPython
* * *
```
curl --request GET \
--url 'https://graph.facebook.com/{Version}/{Phone-Number-ID}/groups' \
--header 'Authorization: Bearer <Token>' \
--header 'Content-Type: application/json' \
--data '{}'
```
Header

## WhatsApp Cloud API - Marketing Messages Lite API
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-phone-number/marketing-messages-lite-api

* * *
Resources
# WhatsApp Cloud API - Marketing Messages Lite API
Copy for LLM
Version
v23.0
Send marketing template messages with automatic delivery optimization.
Delivers relevant, timely messages to customers most likely to engage,
with enhanced deliverability and down-funnel conversion insights.
## Base URL
| https://graph.facebook.com |
## Endpoints
| POST | [/{Version}/{Phone-Number-ID}/marketing\_messages](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-phone-number/marketing-messages-lite-api#post-version-phone-number-id-marketing-messages) |
* * *
## POST /{Version}/{Phone-Number-ID}/marketing\_messages
Send marketing template messages using pre-approved templates. Supports optional product policy controls and message activity sharing settings.
### Request Syntax
**POST**/{Version}/{Phone-Number-ID}/marketing\_messages
Try it
Select language
cURLJavaScriptPython
* * *
```
curl --request POST \
--url 'https://graph.facebook.com/{Version}/{Phone-Number-ID}/marketing_messages' \
--header 'Authorization: Bearer <Token>' \
--header 'Content-Type: application/json' \
--data '{
"messaging_product": "whatsapp",
"recipient_type

## WhatsApp Cloud API - Media Upload API
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-phone-number/media-upload-api

* * *
Resources
# WhatsApp Cloud API - Media Upload API
Copy for LLM
Version
v23.0
Upload media files (images, videos, audio, documents, stickers) to WhatsApp.
Returns a media ID that can be used to send media messages.
Supports multiple file formats and multipart form-data uploads.
## Base URL
| https://graph.facebook.com |
## Endpoints
| POST | [/{Version}/{Phone-Number-ID}/media](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-phone-number/media-upload-api#post-version-phone-number-id-media) |
* * *
## POST /{Version}/{Phone-Number-ID}/media
This request uploads an image as .jpeg. The parameters are specified as form-data in the request body.
### Request Syntax
**POST**/{Version}/{Phone-Number-ID}/media
Select language
cURLJavaScriptPython
* * *
```
curl --request POST \
--url 'https://graph.facebook.com/{Version}/{Phone-Number-ID}/media' \
--header 'Authorization: Bearer <Token>' \
--header 'Content-Type: application/json' \
--data '{
"file": "@/local/path/file.ogg;type=ogg",
"messaging_product": "whatsapp"
}'
```
Select status code
200
* * *
```
{
"Upload Audio (form-data)": {
"value": {
"id": "<MEDIA_ID>"
}
},
"Upload Audi

## WhatsApp Cloud API - Message API
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-phone-number/message-api

* * *
Resources
# WhatsApp Cloud API - Message API
Copy for LLM
Version
v23.0
Send and receive WhatsApp messages including text, media, templates,
interactive messages, reactions, and more. Supports message status
tracking, delivery receipts, and read confirmations.
## Base URL
| https://graph.facebook.com |
## Endpoints
| POST | [/{Version}/{Phone-Number-ID}/messages](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-phone-number/message-api#post-version-phone-number-id-messages) |
* * *
## POST /{Version}/{Phone-Number-ID}/messages
Send Message.
### Request Syntax
**POST**/{Version}/{Phone-Number-ID}/messages
Try it
Select language
cURLJavaScriptPython
* * *
```
curl --request POST \
--url 'https://graph.facebook.com/{Version}/{Phone-Number-ID}/messages' \
--header 'Authorization: Bearer <Token>' \
--header 'Content-Type: application/json' \
--data '{
"audio": {
"id": "<AUDIO_OBJECT_ID>"
},
"messaging_product": "whatsapp",
"recipient_type": "individual",
"to": "{{Recipient-Phone-Number}}",
"type": "audio"
}'
```
Select status code
200
* * *
```
{
"Example response": {
"value": {
"contacts": [\
{\
"input": "+16505551234",\
"wa_id

## WhatsApp Cloud API - Phone Number Deregister API
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-phone-number/phone-number-deregister-api

* * *
Resources
# WhatsApp Cloud API - Phone Number Deregister API
Copy for LLM
Version
v23.0
API for deregistering WhatsApp Business phone numbers from the Facebook Hosted System.
This endpoint allows businesses to deregister a previously registered phone number from
the WhatsApp Business Platform.
## Base URL
| https://graph.facebook.com |
## Endpoints
| POST | [/{Version}/{Phone-Number-ID}/deregister](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-phone-number/phone-number-deregister-api#post-version-phone-number-id-deregister) |
* * *
## POST /{Version}/{Phone-Number-ID}/deregister
Deregister a WhatsApp Business phone number from the Facebook Hosted System.
This operation removes the phone number from the WhatsApp Business Platform
and makes it available for re-registration if needed.
Important Notes:
Phone number must be currently linked in Facebook Hosted System
Phone number must be registered on the WhatsApp Business Platform
Cannot deregister phone numbers associated with SMB accounts
Rate limiting is enforced to prevent abuse
Deregistration triggers activity logging for audit purposes
Rate Limiting:
Standard Graph API

## WhatsApp Business Cloud API - Phone Number Registration
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-phone-number/phone-number-registration

* * *
Resources
# WhatsApp Business Cloud API - Phone Number Registration
Copy for LLM
Version
v23.0
API for registering WhatsApp Business phone numbers with the Cloud API platform.
This endpoint allows businesses to register their phone numbers for WhatsApp Business messaging,
enabling two-step verification and activating the phone number for business communications.
## Base URL
| https://graph.facebook.com |
## Endpoints
| POST | [/{Version}/{Phone-Number-ID}/register](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-phone-number/phone-number-registration#post-version-phone-number-id-register) |
* * *
## POST /{Version}/{Phone-Number-ID}/register
Register a WhatsApp Business phone number for messaging capabilities and enable
two-step verification. This is a required step before sending messages through
the WhatsApp Business Cloud API.
Registration Process:
Phone number must be in UNVERIFIED status
Provide a 6-digit PIN for two-step verification
Optionally provide backup data for account migration
Registration activates messaging capabilities
Migration Support:
For migrating from on-premises WhatsApp Business API, include backup

## ## This page isn't available right now
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-phone-number/phone-number-verification-request-code-api

## This page isn't available right now
This may be because of a technical error that we're working to get fixed. Try reloading this page.
Reload Page

## WhatsApp Cloud API - Settings API
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-phone-number/settings-api

* * *
Resources
# WhatsApp Cloud API - Settings API
Copy for LLM
Version
v23.0
The Settings API allows you to configure various features and settings
for your WhatsApp Business Account phone numbers. You can manage calling
settings, user identity change settings, payload encryption, and data
storage configurations.
## Base URL
| https://graph.facebook.com |
## Endpoints
| GET | [/{Version}/{Phone-Number-ID}/settings](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-phone-number/settings-api#get-version-phone-number-id-settings) |
| POST | [/{Version}/{Phone-Number-ID}/settings](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-phone-number/settings-api#post-version-phone-number-id-settings) |
* * *
## GET /{Version}/{Phone-Number-ID}/settings
Retrieve current settings for a WhatsApp Business phone number.
Returns calling settings, payload encryption settings, and data
storage configurations.
### Request Syntax
**GET**/{Version}/{Phone-Number-ID}/settings
Select language
cURLJavaScriptPython
* * *
```
curl --request GET \
--url 'https://graph.facebook.com/{Version}/{Phone-Number-

## WhatsApp Business Account Phone Number Verification - Verify Code API
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-phone-number/verify-code-api

* * *
Resources
# WhatsApp Business Account Phone Number Verification - Verify Code API
Copy for LLM
Version
v23.0
API for verifying phone number verification codes for WhatsApp Business Account phone numbers.
This endpoint allows businesses to verify phone number verification codes sent during the
phone number registration or verification process.
## Base URL
| https://graph.facebook.com |
## Endpoints
| POST | [/{Version}/{Phone-Number-ID}/verify\_code](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-phone-number/verify-code-api#post-version-phone-number-id-verify-code) |
* * *
## POST /{Version}/{Phone-Number-ID}/verify\_code
Verify a phone number verification code for a WhatsApp Business Account phone number.
This endpoint is used to complete the phone number verification process by submitting
the verification code received via SMS or voice call.
Use Cases:
Complete phone number verification during initial setup
Verify phone number ownership for messaging capabilities
Finalize phone number registration process
Complete phone number migration verification
Rate Limiting:
Verification attempts are rate-limited to prevent abuse.

## WhatsApp Business Account Message History API
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-phone-number/whatsapp-business-account-message-history-api

* * *
Resources
# WhatsApp Business Account Message History API
Copy for LLM
Version
v23.0
API for retrieving WhatsApp Business Account message history and delivery status information.
This endpoint allows businesses to retrieve comprehensive message history for their
WhatsApp Business Account phone numbers, including message delivery status events,
timestamps, and webhook update states.
## Base URL
| https://graph.facebook.com |
## Endpoints
| GET | [/{Version}/{Phone-Number-ID}/message\_history](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-phone-number/whatsapp-business-account-message-history-api#get-version-phone-number-id-message-history) |
* * *
## GET /{Version}/{Phone-Number-ID}/message\_history
Retrieve paginated message history for a WhatsApp Business Account phone number,
including delivery status events, timestamps, and webhook update information.
Use Cases:
Track message delivery status and events
Monitor webhook delivery and update states
Retrieve historical message delivery information
Debug message delivery issues and webhook failures
Rate Limiting:
Standard Graph API rate limits apply. Use appropriate retry l

## WhatsApp Business Account Official Business Account Status API
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-phone-number/whatsapp-business-account-official-business-account-status-api

* * *
Resources
# WhatsApp Business Account Official Business Account Status API
Copy for LLM
Version
v23.0
API for retrieving Official Business Account (OBA) status information for WhatsApp Business Account phone numbers.
This endpoint allows businesses to check the Official Business Account status and related status messages
for their WhatsApp Business Account phone numbers.
## Base URL
| https://graph.facebook.com |
## Endpoints
| GET | [/{Version}/{Phone-Number-ID}/official\_business\_account](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-phone-number/whatsapp-business-account-official-business-account-status-api#get-version-phone-number-id-official-business-account) |
| POST | [/{Version}/{Phone-Number-ID}/official\_business\_account](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-phone-number/whatsapp-business-account-official-business-account-status-api#post-version-phone-number-id-official-business-account) |
* * *
## GET /{Version}/{Phone-Number-ID}/official\_business\_account
Retrieve the Official Business Account (OBA) status and related information for a WhatsA

## WhatsApp Business Account Phone Number API
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-phone-number/whatsapp-business-account-phone-number-api

* * *
Resources
# WhatsApp Business Account Phone Number API
Copy for LLM
Version
v23.0
API for WhatsApp Business Account phone number operations including status management,
settings configuration, messaging setup, webhook configuration, and display name management.
This endpoint provides comprehensive management capabilities for WhatsApp Business
Account phone numbers, enabling businesses to configure phone number status, messaging settings,
webhook endpoints, and business profile information.
## Base URL
| https://graph.facebook.com |
## Endpoints
| GET | [/{Version}/{Phone-Number-ID}](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-phone-number/whatsapp-business-account-phone-number-api#get-version-phone-number-id) |
| POST | [/{Version}/{Phone-Number-ID}](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-phone-number/whatsapp-business-account-phone-number-api#post-version-phone-number-id) |
* * *
## GET /{Version}/{Phone-Number-ID}
Retrieve comprehensive information about a WhatsApp Business phone number using its unique ID (CSID).
This endpoint provides phone number statu

## ## This page isn't available right now
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-phone-number/whatsapp-business-profile-api

## This page isn't available right now
This may be because of a technical error that we're working to get fixed. Try reloading this page.
Reload Page

## WhatsApp Cloud API - WhatsApp Business QR Code API
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-phone-number/whatsapp-business-qr-code-api

* * *
Resources
# WhatsApp Cloud API - WhatsApp Business QR Code API
Copy for LLM
Version
v23.0
API for managing individual WhatsApp Business Account message QR codes by their unique identifier.
Provides endpoints for retrieving and deleting specific message QR codes.
Message QR codes generate WhatsApp deep links with pre-filled messages that customers
can use to start conversations. Each QR code has a unique 14-character identifier.
Requirements: WhatsApp Business Account with whatsapp\_business\_management permission,
verified phone number, valid system user access token, and valid QR code identifier.
## Base URL
| https://graph.facebook.com |
## Endpoints
| GET | [/{Version}/{Phone-Number-ID}/message\_qrdls/{QR-Code-ID}](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-phone-number/whatsapp-business-qr-code-api#get-version-phone-number-id-message-qrdls-qr-code-id) |
| DELETE | [/{Version}/{Phone-Number-ID}/message\_qrdls/{QR-Code-ID}](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-phone-number/whatsapp-business-qr-code-api#delete-version-phone-number-id-message-qrdls-qr-co

## WhatsApp Cloud API - WhatsApp Business QR Code Management API
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-phone-number/whatsapp-business-qr-code-management-api

* * *
Resources
# WhatsApp Cloud API - WhatsApp Business QR Code Management API
Copy for LLM
Version
v23.0
API for managing WhatsApp Business Account message QR code collections.
Provides endpoints for listing all message QR codes and creating new ones.
Message QR codes generate WhatsApp deep links with pre-filled messages that customers
can use to start conversations. Each QR code has a unique 14-character identifier.
Requirements: WhatsApp Business Account with whatsapp\_business\_management permission,
verified phone number, and valid system user access token.
## Base URL
| https://graph.facebook.com |
## Endpoints
| GET | [/{Version}/{Phone-Number-ID}/message\_qrdls](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-phone-number/whatsapp-business-qr-code-management-api#get-version-phone-number-id-message-qrdls) |
| POST | [/{Version}/{Phone-Number-ID}/message\_qrdls](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-phone-number/whatsapp-business-qr-code-management-api#post-version-phone-number-id-message-qrdls) |
* * *
## GET /{Version}/{Phone-Number-ID}/message\_qrdls
Retri

## WhatsApp Business Pre-Verified Phone Number - Request Verification Code API
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-pre-verified-phone-number/request-verification-code-api

* * *
Resources
# WhatsApp Business Pre-Verified Phone Number - Request Verification Code API
Copy for LLM
Version
v23.0
API for requesting verification codes for pre-verified phone numbers in WhatsApp Business Account setup.
This endpoint allows businesses to request verification codes (SMS or voice) for pre-verified phone numbers
during the WhatsApp Business Account onboarding process.
## Base URL
| https://graph.facebook.com |
## Endpoints
| POST | [/{Version}/{Pre-Verified-Phone-Number-ID}/request\_code](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-pre-verified-phone-number/request-verification-code-api#post-version-pre-verified-phone-number-id-request-code) |
* * *
## POST /{Version}/{Pre-Verified-Phone-Number-ID}/request\_code
Request a verification code for a pre-verified phone number via SMS or voice call.
This is part of the WhatsApp Business Account onboarding process where pre-approved
phone numbers must be verified before they can be used for messaging.
Process Flow:
Call this endpoint to request a verification code
User receives code via SMS or voice call
Use the verify\_code endpoint to complete verification
Pho

## WhatsApp Business Pre-Verified Phone Number - Verify Code API
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-pre-verified-phone-number/verify-code-api

* * *
Resources
# WhatsApp Business Pre-Verified Phone Number - Verify Code API
Copy for LLM
Version
v23.0
API for verifying OTP codes for WhatsApp Business Pre-Verified Phone Numbers.
This endpoint allows businesses to verify OTP codes that were sent to pre-verified phone numbers
during the phone number verification process.
## Base URL
| https://graph.facebook.com |
## Endpoints
| POST | [/{Version}/{Pre-Verified-Phone-Number-ID}/verify\_code](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-pre-verified-phone-number/verify-code-api#post-version-pre-verified-phone-number-id-verify-code) |
* * *
## POST /{Version}/{Pre-Verified-Phone-Number-ID}/verify\_code
Verify the OTP code received for a pre-verified phone number to complete the
verification process. This endpoint validates the code and updates the verification
status of the phone number.
Use Cases:
Complete phone number verification during WhatsApp Business onboarding
Verify ownership of phone numbers for business messaging
Enable phone numbers for WhatsApp Business API usage
Rate Limiting:
This endpoint has specific rate limits to prevent abuse:
125 requests per hour for b

## WhatsApp Business Pre-Verified Phone Number API
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-pre-verified-phone-number/whatsapp-business-pre-verified-phone-number-api

* * *
Resources
# WhatsApp Business Pre-Verified Phone Number API
Copy for LLM
Version
v23.0
API for managing WhatsApp Business Pre-Verified Phone Numbers, including validation,
retrieval, and deletion operations.
Pre-verified phone numbers are phone numbers that have been pre-validated by Business
Solution Providers (BSPs) for WhatsApp Business API usage.
## Base URL
| https://graph.facebook.com |
## Endpoints
| GET | [/{Version}/{Pre-Verified-Phone-Number-ID}](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-pre-verified-phone-number/whatsapp-business-pre-verified-phone-number-api#get-version-pre-verified-phone-number-id) |
| DELETE | [/{Version}/{Pre-Verified-Phone-Number-ID}](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-pre-verified-phone-number/whatsapp-business-pre-verified-phone-number-api#delete-version-pre-verified-phone-number-id) |
* * *
## GET /{Version}/{Pre-Verified-Phone-Number-ID}
Retrieve details about a specific pre-verified phone number, including validation
status, formatting information, and any associated error messages.
Use Cases:
Check validation sta

## WhatsApp Business Pre-Verified Phone Number Partners API
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-pre-verified-phone-number/whatsapp-business-pre-verified-phone-number-partners-api

* * *
Resources
# WhatsApp Business Pre-Verified Phone Number Partners API
Copy for LLM
Version
v23.0
API for retrieving partner businesses associated with a WhatsApp Business Pre-Verified Phone Number.
This endpoint allows authorized applications to retrieve the list of partner businesses
that have been granted access to a specific pre-verified phone number.
## Base URL
| https://graph.facebook.com |
## Endpoints
| GET | [/{Version}/{Pre-Verified-Phone-Number-ID}/partners](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-pre-verified-phone-number/whatsapp-business-pre-verified-phone-number-partners-api#get-version-pre-verified-phone-number-id-partners) |
* * *
## GET /{Version}/{Pre-Verified-Phone-Number-ID}/partners
Retrieve the list of partner businesses that have been granted access to a specific
WhatsApp Business Pre-Verified Phone Number.
Use Cases:
Monitor partner business relationships and access permissions
Verify which businesses have access to shared pre-verified phone numbers
Retrieve partner business information for operational purposes
Validate partnership configurations before business operations
Rate Limiting:
Sta

## ## This page isn't available right now
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-profile/whatsapp-business-profile-node-api

## This page isn't available right now
This may be because of a technical error that we're working to get fixed. Try reloading this page.
Reload Page

## WhatsApp Business Multi-Partner Solutions - Accept Deactivation Request API
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-solution/accept-deactivation-request-api

* * *
Resources
# WhatsApp Business Multi-Partner Solutions - Accept Deactivation Request API
Copy for LLM
Version
v23.0
API for accepting deactivation requests for WhatsApp Business Multi-Partner Solutions.
This endpoint allows solution partners to accept pending deactivation requests for their
Multi-Partner Solutions.
## Base URL
| https://graph.facebook.com |
## Endpoints
| POST | [/{Version}/{Solution-ID}/accept\_deactivation\_request](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-solution/accept-deactivation-request-api#post-version-solution-id-accept-deactivation-request) |
* * *
## POST /{Version}/{Solution-ID}/accept\_deactivation\_request
Accepts a pending deactivation request for a WhatsApp Business Multi-Partner Solution.
This endpoint completes the partner approval workflow by accepting a deactivation request
that was previously initiated by another solution partner. Upon successful acceptance,
the solution status transitions from ACTIVE to DEACTIVATED, and the pending request
status changes from PENDING\_DEACTIVATION to NONE.
Important Business Logic:
Solution must be in ACTIVE status with PENDING\_DEACTIVATION pe

## WhatsApp Business Multi-Partner Solutions - Access Token API
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-solution/access-token-api

* * *
Resources
# WhatsApp Business Multi-Partner Solutions - Access Token API
Copy for LLM
Version
v23.0
API for retrieving granular BISU (Business Integration System User) access tokens for Multi-Partner Solution partners.
This endpoint allows solution partners to obtain granular access tokens that provide secure, scoped access to WhatsApp Business Accounts shared with their Multi-Partner Solution.
## Base URL
| https://graph.facebook.com |
## Endpoints
| GET | [/{Version}/{Solution-ID}/access\_token](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-solution/access-token-api#get-version-solution-id-access-token) |
* * *
## GET /{Version}/{Solution-ID}/access\_token
Retrieve a granular BISU access token for accessing customer business resources through the Multi-Partner Solution. The token provides secure, scoped access to WhatsApp Business Accounts that have been shared with the solution.
Use Cases:
Obtain secure access tokens for partner applications to access customer business resources
Enable multi-tenant partner architectures with dedicated tokens per customer business
Support secure API operations on shared WhatsApp Busine

## WhatsApp Business Multi-Partner Solutions - Reject Deactivation Request API
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-solution/reject-deactivation-request-api

* * *
Resources
# WhatsApp Business Multi-Partner Solutions - Reject Deactivation Request API
Copy for LLM
Version
v23.0
API for rejecting deactivation requests for Multi-Partner Solutions.
This endpoint allows solution partners to reject pending deactivation requests for their
Multi-Partner Solutions.
## Base URL
| https://graph.facebook.com |
## Endpoints
| POST | [/{Version}/{Solution-ID}/reject\_deactivation\_request](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-solution/reject-deactivation-request-api#post-version-solution-id-reject-deactivation-request) |
* * *
## POST /{Version}/{Solution-ID}/reject\_deactivation\_request
Reject a pending deactivation request for a Multi-Partner Solution. This endpoint allows
solution partners to decline deactivation requests from solution owners, maintaining the
solution in its current active operational state.
Use Cases:
Reject deactivation requests from solution owners
Maintain active solution partnerships when deactivation is not appropriate
Respond programmatically to deactivation requests through API integration
Keep solutions operational when business requirements or partnership

## WhatsApp Business Multi-Partner Solutions - Send Deactivation Request API
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-solution/send-deactivation-request-api

* * *
Resources
# WhatsApp Business Multi-Partner Solutions - Send Deactivation Request API
Copy for LLM
Version
v23.0
API for sending deactivation requests for Multi-Partner Solutions.
This endpoint allows solution partners to request deactivation of their
Multi-Partner Solutions.
## Base URL
| https://graph.facebook.com |
## Endpoints
| POST | [/{Version}/{Solution-ID}/send\_deactivation\_request](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-solution/send-deactivation-request-api#post-version-solution-id-send-deactivation-request) |
* * *
## POST /{Version}/{Solution-ID}/send\_deactivation\_request
Submit a deactivation request for a Multi-Partner Solution. This initiates
a workflow to transition the solution from its current state to deactivated,
following proper business validation and approval processes.
Use Cases:
Request deactivation of an active Multi-Partner Solution
Initiate solution lifecycle transition management
Trigger business workflow for solution deactivation approval
Programmatically manage solution lifecycle states
Business Logic:
Solution must be in ACTIVE or INITIATED state to be eligible for deactivation

## WhatsApp Business Multi-Partner Solutions - Solution Accept API
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-solution/solution-accept-api

* * *
Resources
# WhatsApp Business Multi-Partner Solutions - Solution Accept API
Copy for LLM
Version
v23.0
API for accepting Multi-Partner Solution partnership invitations.
This endpoint allows partner applications to accept invitations to participate in
Multi-Partner Solutions.
## Base URL
| https://graph.facebook.com |
## Endpoints
| POST | [/{Version}/{Solution-ID}/accept](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-solution/solution-accept-api#post-version-solution-id-accept) |
* * *
## POST /{Version}/{Solution-ID}/accept
Accept an invitation to participate in a Multi-Partner Solution as a partner application.
This endpoint transitions the partner's status from NOTIFICATION\_SENT to ACCEPTED,
enabling the solution to progress toward ACTIVE status once all required partners accept.
Use Cases:
Accept partnership invitations for Multi-Partner Solutions
Activate partner participation in existing solutions
Confirm partner app's commitment to solution terms and conditions
Enable solution workflow progression from INITIATED to ACTIVE status
Business Logic:
Only invited partner apps can accept solution invitations
Solution mu

## ## This page isn't available right now
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-solution/solution-details-api

## This page isn't available right now
This may be because of a technical error that we're working to get fixed. Try reloading this page.
Reload Page

## WhatsApp Business Multi-Partner Solutions - Solution Reject API
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-solution/solution-reject-api

* * *
Resources
# WhatsApp Business Multi-Partner Solutions - Solution Reject API
Copy for LLM
Version
v23.0
API for rejecting Multi-Partner Solution partnership requests or deactivation requests.
This endpoint allows solution partners to reject pending partnership requests or deactivation
requests for Multi-Partner Solutions.
## Base URL
| https://graph.facebook.com |
## Endpoints
| POST | [/{Version}/{Solution-ID}/reject](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-solution/solution-reject-api#post-version-solution-id-reject) |
* * *
## POST /{Version}/{Solution-ID}/reject
Reject a pending partnership request or deactivation request for a Multi-Partner Solution.
This endpoint allows solution owners to decline incoming requests and maintain control
over their solution partnerships and lifecycle.
Use Cases:
Reject partnership requests from unauthorized or incompatible applications
Decline deactivation requests to keep solutions active
Maintain solution security and partnership quality
Control solution access and collaboration boundaries
Request Types:
PARTNERSHIP\_REQUEST: Reject an incoming partnership request from another

## ## This page isn't available right now
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/app-review/

## This page isn't available right now
This may be because of a technical error that we're working to get fixed. Try reloading this page.
Reload Page

## ## This page isn't available right now
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/get-started-for-solution-partners/

## This page isn't available right now
This may be because of a technical error that we're working to get fixed. Try reloading this page.
Reload Page

## ## This page isn't available right now
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/get-started-for-tech-providers/

## This page isn't available right now
This may be because of a technical error that we're working to get fixed. Try reloading this page.
Reload Page

## Managing WhatsApp Business Accounts
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/manage-accounts/

* * *
Resources
# Managing WhatsApp Business Accounts
Updated: Nov 4, 2025
This document describes common endpoints used to manage business customer WhatsApp Business Accounts.
## Get Shared WABA ID with Access Token
After a business finishes the embedded signup flow, you can get the shared WABA ID using the returned `accessToken` with the [Debug Token](https://developers.facebook.com/docs/graph-api/reference/debug_token) endpoint. Include your [System User access token](https://developers.facebook.com/docs/marketing-api/system-users/install-apps-and-generate-tokens#generate-token) in a request header prepended with `Authorization: Bearer` for this API call.
### Request Syntax
```
GET https://graph.facebook.com/<API_VERSION>/debug_token
?input_token=<TOKEN_RETURNED_FROM_SIGNUP_FLOW>
```
### Sample Request
```
curl \
'https://graph.facebook.com/v24.0/debug_token?input_token=EAAFl...' \
-H 'Authorization: Bearer EAAJi...'
```
### Sample Response
```
{
"data" : {
"app_id" : "670843887433847",
"application" : "JaspersMarket",
"data_access_expires_at" : 1672092840,
"expires_at" : 1665090000,
"granular_scopes" : [\
{\
"scope" : "whatsapp_business_management",\
"target_ids" : [\
"10228959

## Business customer phone numbers
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/manage-phone-numbers/

* * *
Resources
# Business customer phone numbers
Updated: Dec 12, 2025
This document describes business customer phone numbers, their requirements, and endpoints commonly used to manage business phone numbers.
## Basics
Your business customers need a dedicated number to use WhatsApp. Phone numbers already in use with the WhatsApp app are not supported, but numbers in use with the WhatsApp Business app [can be registered](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users).
Business customers can have multiple phone numbers associated with their [Meta Business Account](https://business.facebook.com/settings/), so they can [add another number for API use](https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/manage-phone-numbers/#adding-more-phone-numbers) if they wish.
When completing the Embedded Signup flow, your business customers should use a phone number and display name that they want to have appear in the WhatsApp app. We strongly discourage signing up with a test or personal number, or test display name, as are difficult to change.
For more detailed information relati

## Manage System Users
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/manage-system-users/

* * *
Resources
# Manage System Users
Updated: Nov 14, 2025
Adding your System User to shared WhatsApp Business Accounts allows you to programmatically manage the accounts. On this guide, we go over actions BSPs may need to perform to manage their system users.
For help creating a system user, see [System Users, Create, Retrieve and Update a System User](https://developers.facebook.com/docs/marketing-api/system-users/create-retrieve-update).
For help generating your system user access token, see [System Users, Install Apps and Generate Tokens](https://developers.facebook.com/docs/marketing-api/system-users/install-apps-and-generate-tokens#generate-token).
## Retrieve System User IDs
You can cache the System User IDs for future use.
### Request
```
curl -i -X GET "https://graph.facebook.com/<API_VERSION>/<WHATSAPP_BUSINESS_ACCOUNT_ID>/system_users
?access_token=<SYSTEM_USER_ACCESS_TOKEN>"
```
To find the ID of a business, go to [**Business Manager**](https://business.facebook.com/) \> **Business Settings** \> **Business Info**. There, you will see information about the business, including the ID.
### Response
```
{
"data": [\
{\
"id": "1972555232742222",\
"name": "My System User",\

## Managing Webhooks
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/manage-webhooks/

* * *
Resources
# Managing Webhooks
Updated: Dec 12, 2025
WhatsApp Business Accounts (WABAs) and their assets are objects in the Facebook Social Graph. When a trigger event occurs to one of those objects, Facebook sees it and sends a notification to the webhook URL specified in your Facebook App’s dashboard.
In the context of embedded signup, you can use webhooks to get notifications of changes to your WABAs, phone numbers, message templates, and messages sent to your phone numbers.
**You must [individually subscribe to every WABA](https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/manage-webhooks/#subscribe-to-webhooks-on-a-business-customer-waba) for which you wish to receive webhooks.** After fetching the client’s WABA ID, subscribe your app to the ID in order to start receiving webhooks.
See [Webhooks](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/overview) for more information about webhooks and fields.
## Subscribe to webhooks on a business customer WABA
Use the [POST /<WABA\_ID>/subscribed\_apps](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-

## Measurement Partners
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/measurement-partners/

* * *
Resources
# Measurement Partners
Updated: Dec 12, 2025
A Measurement Partner is a third-party company that helps businesses measure the effectiveness of their marketing campaigns on our platform.
Measurement Partners gain read-only access to WhatsApp Business Account (WABA) analytics data and webhooks. Specifically, they can view phone numbers, message templates, and incoming messages, and can access WABA analytics data.
For a business to share their analytics data with a Measurement Partner, they must already have a WABA. Measurement Partners cannot create WABAs or send messages on behalf of their clients.
## Onboarding flow overview
Follow these steps to onboard as a Measurement Partner:
Create your Facebook Login Button using the Measurement Partner ES template instructions below
Embed the Facebook Login Button on your website
## How to create Facebook Login button using the Measurement Partner ES template
Follow the steps below to create your Facebook Login button that will show the Measurement Partner ES flow to your customers.
## Step 1: Load the Facebook JavaScript SDK
See [Basic Setup](https://developers.facebook.com/docs/javascript/quickstart#loading) for instruction

## Migrate an existing WhatsApp Number to a Business Account
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/migrate-existing-whatsapp-number-to-a-business-account/

* * *
Resources
# Migrate an existing WhatsApp Number to a Business Account
Updated: Oct 31, 2025
To use an existing WhatsApp Messenger phone number with Cloud API, you must first delete your WhatsApp Messenger account.
To use an existing WhatsApp Business app phone number with Cloud API, you must either delete your account, or onboard to the platform [using a solution provider](https://business.facebook.com/messaging/partner-showcase) who supports [business app number onboarding](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users). **Remember to back up your chat history from the WhatsApp Business App. These are guides on how to do so for [Android](https://l.facebook.com/l.php?u=https%3A%2F%2Ffaq.whatsapp.com%2F744445782709185%2F%3Fhelpref%3Dfaq_content&h=AT1pxnGrUz5fxN9O4i1sCWKhoazyvr76PKaSoZPssZiVUdHxzMrV1xFl3lQMUTMs5xcwW8ldyIUDg-qRQOjit1-_9GO5ku5vzb_nG_pbP4S2qAZ81kWXFuQG2DYVhOmFl3tz4kUDTGZfSw) or [iOS](https://l.facebook.com/l.php?u=https%3A%2F%2Ffaq.whatsapp.com%2F180225246548988%2F&h=AT1pxnGrUz5fxN9O4i1sCWKhoazyvr76PKaSoZPssZiVUdHxzMrV1xFl3lQMUTMs5xcwW8ldyIUDg-qRQOjit1-_9GO5ku5vzb_nG_pbP4S2qAZ81kWXFuQG2DYVhO

## Multi-Partner Solution — Embedded creation
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/multi-partner-solution-embedded-creation/

* * *
Resources
# Multi-Partner Solution — Embedded creation
Updated: Dec 12, 2025
[Multi-Partner Solutions](https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/multi-partner-solutions) (MPS) allow Solution Partners and Tech Providers to jointly manage customer WhatsApp assets in order to provide WhatsApp messaging services to customers.
If you are a Solution Partner, instead of using the app dashboard to create an MPS, you can create one using a snippet of JavaScript and an HTML button which you can embed somewhere on your website. Tech Providers who want to partner with you can use the button to grant your app permission to manage solutions for one or more of their apps, which you can then do using a series of API requests.
## Flow
Tech Providers who visit your website and click the embedded solution creation button will be asked to authenticate, and after doing so, will be presented with an interface that allows them to choose an existing app:
![](https://scontent-mia5-1.xx.fbcdn.net/v/t39.2365-6/458542138_1146317889773905_7397800002017796139_n.png?_nc_cat=101&ccb=1-7&_nc_sid=e280be&_nc_ohc=HtY5MbtpGRQQ7kNvwGv90wl&_nc_oc=Adk9sXNKRpHk3FMdG

## Multi-Partner Solutions
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/multi-partner-solutions/

* * *
Resources
# Multi-Partner Solutions
Updated: Dec 12, 2025
This document explains how to set up Multi-Partner Solutions (“solutions”) and how to use them with [Embedded Signup](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/overview).
Multi-Partner Solutions allow Solution Partners and Tech Providers to jointly manage customer WhatsApp assets in order to provide WhatsApp messaging services to their customers. For example, if you are a Tech Provider and are unable to offer custom or full WhatsApp messaging services to your customers, you can work with a Solution Partner to offer your customers the Solution Partner’s services.
Once created and accepted via API or App Dashboard, the solution’s ID can be used to customize the Embedded Signup flow. Any customers onboarded via the customized flow can grant asset access to all of the solution’s partners.
Note that solutions can also be set up via an embedded button that triggers an interface that gathers app information from Tech Providers. This flow and the API calls involved are described in the [Multi-Partner Solution — Embedded Creation](https://developers.facebook.com/documentation/busi

## Multi-solution Conversations (MSC)
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/multi-solution-conversations/

* * *
Resources
# Multi-solution Conversations (MSC)
Updated: Dec 4, 2025
**Feature Availability: Invite-only beta. Managed partners, reach out to your SPM for more details**
To qualify for Multi-Solution Conversations, your business must have a messaging limit of 2,000 or higher.
**If WABAs associated with your phone numbers have restrictions or bans, you cannot onboard to the MSC Closed Beta.** Please [clear these restrictions](https://business.facebook.com/business-support-home/) before attempting to onboard.
Some features may not be available or work as expected. [Beta terms apply](https://www.facebook.com/legal/BetaProductTestingTerms).
## Overview
Multi-Solution Conversations enables businesses to use multiple partners and solutions **on the same phone number**, enabling a seamless chat thread experience for their customers.
![](https://scontent-mia5-1.xx.fbcdn.net/v/t39.2365-6/514415965_1411106036830432_6948086596070603950_n.png?_nc_cat=104&ccb=1-7&_nc_sid=e280be&_nc_ohc=aNRZXdICmfoQ7kNvwF4t553&_nc_oc=AdmoK_AAkGs4FVg5JsqY3LjbkmVotEkQwR-I6zZ9zehWGv2VRJdMjtAb2G7oD_e9ApY&_nc_zt=14&_nc_ht=scontent-mia5-1.xx&_nc_gid=9xIeF2g3tjjx0LIrI5pxYg&oh=00_AflnH6qoBl7HSs5XtTFNUTpVd9AnTHzXMsD

## On-Behalf-Of account ownership model deprecation
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/obo-model-deprecation/

* * *
Resources
# On-Behalf-Of account ownership model deprecation
Updated: Nov 14, 2025
We have deprecated the On-Behalf-Of (“OBO”) account ownership model and replaced it with [partner-initiated WABA creation](https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/partner-initiated-waba-creation). All existing WABAs created under the OBO model should have been transferred to business customers by October 1, 2025. Post 1st October 2025, all the eligible OBO accounts will be auto-migrated in batches through the end of 2025.
## Deprecation timeline
![](https://scontent-lax3-1.xx.fbcdn.net/v/t39.2365-6/485146176_691212949947759_244674574159890376_n.png?_nc_cat=109&ccb=1-7&_nc_sid=e280be&_nc_ohc=EkE0_wmNtygQ7kNvwHOJqhZ&_nc_oc=AdkPz8uQc0eO-Mul7OsoTJO7Q3haCSzWuTGN4euNOSr-JJtJt2D8A8pFU36Ffrx8tt8&_nc_zt=14&_nc_ht=scontent-lax3-1.xx&_nc_gid=Cl9M0vpqQtGxKZDG56XpQw&oh=00_AfkriZt2mXT1LqYQlv2ag04Yysz6gg45XNlwdKx0CAVoUQ&oe=6964EA42)
**March 24, 2025**: [partner-initiated WABA creation](https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/partner-initiated-waba-creation) is made available to all Solution Providers.
**S

## Solution providers
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/overview/

* * *
Resources
# Solution providers
Updated: Nov 14, 2025
This documentation contains information, instructions, and resources for **solution providers** — businesses that provide, or want to provide, WhatsApp messaging services to other businesses. If you are building an app that will not be used by other businesses, refer to our [Cloud API Get Started](https://developers.facebook.com/documentation/business-messaging/whatsapp/get-started) guide instead.
Solution providers are business entities that deploy value-added solutions as WhatsApp authorized service providers on behalf of their business customers. Solution providers include Solution Partners, Tech Providers, and Tech Partners.
## Solution Partners
Solution Partners are [Meta Business Partners](https://www.facebook.com/business/marketing-partners/become-a-partner) that provide a full range of WhatsApp Business Platform services to other businesses, such as messaging services, billing, integration support, and customer support.
Solution Partners have [credit lines](https://www.facebook.com/business/help/1684730811624773?id=2129163877102343) which can be extended to business customers who they bring on board, thus removing t

## ## This page isn't available right now
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/partner-initiated-waba-creation/

## This page isn't available right now
This may be because of a technical error that we're working to get fixed. Try reloading this page.
Reload Page

## Partner-led Business Verification
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/partner-led-business-verification/

* * *
Resources
# Partner-led Business Verification
Updated: Nov 14, 2025
This feature is currently only available to approved **Select Solution** and **Premier** Solution Partners. See our [Sign up for partner-led business verification](https://www.facebook.com/business/help/1091073752691122) Help Center article to learn how to request approval.
This document describes how to create business verification submissions for business customers who have been onboarded via Embedded Signup.
If you are an approved Solution Partner, you can gather required business verification documentation from your onboarded business customers and submit their business for verification on their behalf. Decisions on submissions created in this way can be made in minutes instead days.
## Requirements
you must already be an approved **Select Solution** or **Premier** Solution Partner, and [approved for access](https://www.facebook.com/business/help/1091073752691122)
your [system user access token](https://developers.facebook.com/documentation/business-messaging/whatsapp/access-tokens#system-user-access-tokens)
the system user whose system token you are using must be an admin on your business portfolio (see

## ## This page isn't available right now
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/pixel-tracking/

## This page isn't available right now
This may be because of a technical error that we're working to get fixed. Try reloading this page.
Reload Page

## Registering business phone numbers
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/registering-phone-numbers/

* * *
Resources
# Registering business phone numbers
Updated: Nov 14, 2025
This document describes the steps to programmatically register business phone numbers on WhatsApp Business Accounts (WABA).
Note that **Embedded Signup performs steps 1-3 automatically** (unless you are [bypassing the phone number addition screen](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/bypass-phone-addition)) so you only need to perform step 4 when a business customer completes the flow. If you have disabled phone number selection, however, you must perform all 4 steps.
Registering business phone numbers is a four step process:
Create the number on a WABA.
Get a verification code for that number.
Use the code to verify the number.
Register the verified number for use with Cloud API or On-Premises API.
These steps are described below.
You can also perform all 4 steps repeatedly to register business phone numbers in bulk.
## Limitations
Business phone numbers must meet our [phone number requirements](https://developers.facebook.com/docs/whatsapp/phone-numbers#requirements).
## Step 1: Create the phone number
Send a POST request to the [WhatsApp Business Accoun

## ## This page isn't available right now
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/share-and-revoke-credit-lines/

## This page isn't available right now
This may be because of a technical error that we're working to get fixed. Try reloading this page.
Reload Page

## ## This page isn't available right now
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/support/

## This page isn't available right now
This may be because of a technical error that we're working to get fixed. Try reloading this page.
Reload Page

## Adding a WABA to a Multi-Partner Solution
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/support/adding-waba-to-mps/

* * *
Resources
# Adding a WABA to a Multi-Partner Solution
Updated: Dec 12, 2025
If you are a Solution Partner and are part of an active [multi-partner solution](https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/multi-partner-solutions), you can designate a WABA as _eligible_ for the solution (the “destination solution”). This sends a Business Manager request to the business customer who owns the WABA. The customer can then use the Business Manager to accept and confirm the request.
Confirmation associates the WABA with the destination solution, thereby granting permissions (already defined on the destination solution) to any Tech Providers who are part of it.
If you’re unsure of the WABA’s ownership model, request the `ownership_type` field on the WABA ID. A value of `ON_BEHALF_OF` indicates you own the WABA, while `CLIENT_OWNED` indicates that your business customer owns the WABA.
## Requirements
The WABA must have been onboarded by you.
The WABA cannot already be part of an existing active solution.
The destination solution must be in an active state.
## Step 1: Designate the WABA as solution eligible
Use the [POST /<WHATSAPP\_BUSINESS

## Support for onboarded business customers
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/support/business-customer-support/

* * *
Resources
# Support for onboarded business customers
Updated: Nov 14, 2025
This document is intended to solve common problems encountered by business customers who have been onboarded onto the WhatsApp Business Platform by a [solution provider](https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/overview).
## Contacting support
If you were onboarded to the WhatsApp Business Platform by a solution provider and you have [registered](https://developers.facebook.com/async/registration/) as a Meta developer, you can get help by opening a Direct Support ticket using the **Ask a Question** button at:
See our [Direct Support Information](https://www.facebook.com/business/help/182669425521252) Help Center article for more information about Direct Support.
## Billing and payments
### Billing and payment support
To get support specifically related to billing, payments, and payment methods, open a [Direct Support](https://business.facebook.com/direct-support/) ticket with the following form selections:
**Topic** — **Dev: Billing, Credit & Pricing**
**Request Type** — **Credit Card Billing**
If you do not see the **Dev: Billing, Credit & Pricing**

## ## This page isn't available right now
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/support/migrating-customers-off-solutions-via-embedded-signup/

## This page isn't available right now
This may be because of a technical error that we're working to get fixed. Try reloading this page.
Reload Page

## Migrating customers off of a Multi-Partner Solution using Meta Business Suite
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/support/migrating-customers-off-solutions-via-meta-business-suite/

* * *
Resources
# Migrating customers off of a Multi-Partner Solution using Meta Business Suite
Updated: Nov 14, 2025
If you are a Tech Provider, you can migrate a business customer off of a [Multi-Partner Solution](https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/multi-partner-solutions) by tagging their WhatsApp Business Account (“WABA”) for migration and instructing them to use [Meta Business Suite](https://business.facebook.com/) to review and accept the request. Once migrated, you can provide messaging services to the customer independently.
Migrating a customer off of a solution via Meta Business Suite does not require business phone number reverification, so any downtime due to reverification is eliminated.
## Requirements
Your app must already be approved for advanced access for the **whatsapp\_business\_management** permission
## Templates
Templates are automatically duplicated in the destination WABA and initially granted the same status as their source counterparts.
After duplication however, templates are re-checked to ensure they are correctly categorized according to our [guidelines](https://developers.facebook.com/documenta

## Migrating a business phone number from one Solution Partner to another programmatically
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/support/migrating-phone-numbers-among-solution-partners-programmatically/

* * *
Resources
# Migrating a business phone number from one Solution Partner to another programmatically
Updated: Nov 26, 2025
This document describes how Solution Partners can migrate business phone numbers from one Solution Partner and WhatsApp Business Account (WABA) to another Solution Partner and WABA using the API. Only use this method if you are going to be working with the business customer using the On-Behalf-Of model (i.e. you will create and own the destination WABA and its assets and share them with the customer).
If you would like to migrate customer phone numbers via Embedded Signup (which is recommended), see our [Migrating Phone Numbers Between WhatsApp Business Accounts via Embedded Signup](https://developers.facebook.com/docs/whatsapp/business-management-api/guides/migrate-phone-to-different-waba) document.
## Overview
Solution Partners and businesses directly integrated with the WhatsApp Business Platform can migrate a registered phone number from one WABA to another. Migrated phone numbers keep their display name, quality rating and [messaging limit](https://developers.facebook.com/documentation/business-messaging/whatsapp/messaging-limits), [Official Business

## Migrating a business phone number from one Solution Partner to another via Embedded Signup
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/support/migrating-phone-numbers-among-solution-partners-via-embedded-signup/

* * *
Resources
# Migrating a business phone number from one Solution Partner to another via Embedded Signup
Updated: Nov 14, 2025
This document describes how to use Embedded Signup to migrate business phone numbers from one Solution Partner and WhatsApp Business Account (WABA) to another Solution Partner and WABA.
Customers can migrate their business phone numbers between WhatsApp Business Accounts (WABAs) and retain their display names, quality ratings, template messaging limits, Official Business Account statuses, and approved, high-quality templates. Migration typically is only performed when a customer wants to move their business phone number from one Solution Partner to another.
To perform a migration for a customer, you have two options: migration via Embedded Signup, or programmatic migration.
**Migration via Embedded Signup is simpler and is the preferred solution** because it can be initiated by your customers, automatically generates and grants ownership of all necessary assets, grants your app access to those assets, and requires fewer API calls.
Programmatic migration must be initiated by you and involves more API calls, as you must verify that dependent assets are co

## Migrating a WABA from one Solution Partner to another via Embedded Signup
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/support/migrating-wabas-among-solution-partners-via-embedded-signup/

* * *
Resources
# Migrating a WABA from one Solution Partner to another via Embedded Signup
Updated: Nov 4, 2025
If you are Solution Partner, business customers can switch from their current Solution Partner over to you by unsharing their WABA with their current partner and resharing it with you. All business phone numbers and templates associated will continue to work normally once the process is complete.
Once the customer initiates the process, they will be unable to send messages again until you replace their current credit line with yours. This happens on the 1st of the following month in which you use the API to share your credit line. Note, however, that you cannot use the API to share your credit line (with a customer who has switched partners) the last 3 days or first 4 days of any month. Therefore, to ensure the shortest amount of downtime for customers, advise them to begin the process near the end of the month, but at least 3 days before it ends, so you can perform the API call in the same month.
## Limitations
Customers must own their WABA. WABAs owned by Solution Partners (the [On-Behalf-Of model](https://developers.facebook.com/documentation/business-messaging/whatsa

## Migrating a WABA from one Multi-Partner Solution to another via Embedded Signup
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/support/migrating-wabas-among-solutions-via-embedded-signup/

* * *
Resources
# Migrating a WABA from one Multi-Partner Solution to another via Embedded Signup
Updated: Nov 10, 2025
If you are a Tech Provider, you can use the API and [Embedded Signup](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/overview) to migrate a business customer’s WABA from one Multi-Partner Solution (the “source solution”) to another (the “destination solution”).
As part of this process, a new WhatsApp Business Account (WABA) will be created for the business customer, templates within the source WABA will be duplicated in the destination WABA, and access to the WABA and its assets will be granted to the destination solution’s Solution Partner.
## Requirements
Your app (or apps, if you are using separate apps) used to create or accept the source and destination Multi-Partner Solutions must be associated with the same business portfolio.
The destination solution must also be in an Active state.
## Templates
Templates are automatically duplicated in the destination WABA and initially granted the same status as their source counterparts.
After duplication however, templates are re-checked to ensure they are correctly categorize

## Migrating a WABA from one Multi-Partner Solution to another via Meta Business Suite
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/support/migrating-wabas-among-solutions-via-meta-business-suite/

* * *
Resources
# Migrating a WABA from one Multi-Partner Solution to another via Meta Business Suite
Updated: Nov 14, 2025
You can use the API and the Meta Business Suite’s **Business settings** panel to migrate a business customer’s WhatsApp Business Account (WABA) from one [Multi-Partner Solution](https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/multi-partner-solutions) (the “source solution”) to another (the “destination solution”).
As part of this process, a new WhatsApp Business Account (WABA) will be created for the business customer, templates within the source WABA will be duplicated in the destination WABA, and access to the WABA and its assets will be granted to the destination solution’s Solution Partner.
Note that both you and the destination solution’s Solution Partner must perform one or more API requests to complete the process.
## Requirements
Your app (or apps, if you are using separate apps) used to create or accept each solution must be associated with the same business portfolio, and the destination solution must be in an active state.
## Templates
Templates are automatically duplicated in the destination WABA and ini

## Upgrading to a Tech Partner
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/upgrade-to-tech-partner/

* * *
Resources
# Upgrading to a Tech Partner
Updated: Nov 4, 2025
This document describes the requirements and steps you must to take to become a Tech Partner.
## Product Journey
The product journey details the steps for Tech Providers to upgrade to become a Tech Partner on the Meta Developer Platform.
Becoming a Tech Partner allows you to have even more choices and control of WhatsApp messaging solutions. It also grants access to benefits such as:
Training and support
Analytics reports
Business customer matching opportunities
![](https://scontent-mia3-2.xx.fbcdn.net/v/t39.2365-6/449066641_1419614278738662_6728261400860426265_n.png?_nc_cat=105&ccb=1-7&_nc_sid=e280be&_nc_ohc=HK8soIPTpz4Q7kNvwHrQJ0I&_nc_oc=AdmrGIVmSAxE9A-DdAIUFsLZYcbwZA5kDE9OTg8Y1qO-N5rcqHYMufvbJGytzFe-xUk&_nc_zt=14&_nc_ht=scontent-mia3-2.xx&_nc_gid=w-jsmg57jqWV26qgH0uVAA&oh=00_AfmK4Qp586HSSVKG3x2Cd_d0lvsqKaGMVXqPNwgGX93opA&oe=6964DFB2)
## Context
### Definitions
During this upgrade process, there are a couple of surfaces and definitions that you will come across:
**Meta for Developers** \- The entry point for developer documentation and common tools and dashboards, including the [App Dashboard](https://developers.f

## Support
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/support/

* * *
Resources
# Support
Updated: Nov 19, 2025
## Terms and policies
## API status
See [WhatsApp Business API Status](https://l.facebook.com/l.php?u=https%3A%2F%2Fmetastatus.com%2Fwhatsapp-business-api&h=AT29DNw2zQdda-Cbz32RG6FkxD6sPDVX63OiQgH17N9EG9dt1nwgSjFcCnNgK6dX0Y8mmULzCTvPw6rxztO4V5jHN7-X5LJlZ8lnnUzDvqZjjdQvgrG6FqR6ZQZW2qj3sCOylEeDV63v3w) to learn about our WhatsApp Business API Status page and what information it reports.
## Developer support
All WhatsApp Business Platform developers can contact Meta developer support at:
## Developer community forum
All WhatsApp Business Platform developers can ask a question on the [Meta Developer Community Forum](https://developers.facebook.com/community).
## Reporting bugs
All WhatsApp Business Platform developers can report a bug, file a bug report at:
## Enterprise developer support
If you are an enterprise developer, such as a [solution provider](https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/overview) or managed partner, you can open a **Direct Support** ticket using the link below. If you have multiple Meta business accounts, be sure to select the appropriate account.
Note that if you

## WhatsApp for Business Platform Status
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/support/api-status-page/

* * *
Resources
# WhatsApp for Business Platform Status
Updated: Nov 17, 2025
Meta provides a [WhatsApp Business API Status page](https://l.facebook.com/l.php?u=https%3A%2F%2Fstatus.fb.com%2Fwhatsapp-business-api&h=AT1LOKiN_XrgeYwlnpke3U7kCY7gymZcICNR9d7jICfwrshC6Kk6aLbUQhDWTN4QHyDGlbjjan4KT1-YVCYRQBpAqqA-vW1X7gOX3U0p92qomZim1p8pMfcAzTjYrM11cQInBNwgh9MOrQ) that reports real-time service status updates for the WhatsApp Business Platform. This includes detailed Cloud API [availability](https://developers.facebook.com/documentation/business-messaging/whatsapp/support/api-status-page/#availability) and [latency](https://developers.facebook.com/documentation/business-messaging/whatsapp/support/api-status-page/#latency) metrics for better observability of the platform. You can monitor this page to check whether the services are currently experiencing disruptions or outages. The status page also reports when the services have no known issues.
If you are having issues with the platform, it is important to check this page first to determine if the problem is on our end or if it is your business implementation, hardware, or your network. If we report no known issues with the services and you

## Error codes
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/support/error-codes

* * *
Resources
# Error codes
Updated: Dec 12, 2025
The Cloud API is built on the Graph API, so if you are unfamiliar with handling Graph API error responses, see the [Graph API error handling](https://developers.facebook.com/docs/graph-api/guides/error-handling) documentation.
In general, we recommend that you build your app’s error handling logic around `code` values and `details` payload properties. These properties and their values are more indicative of the underlying error.
Code titles, which do not have a dedicated property in API error response payloads, are included as part of the `message` value. However, we recommend that you do not rely on titles for your error handling logic as titles will eventually be deprecated.
**Receiving Errors: Synchronous and Asynchronous**
Cloud API errors are returned either synchronously as a Graph API response, asynchronously via Webhook, or sometimes through both methods.
It is a good practice when working with Cloud API that you monitor both the Graph API response and the `messages` webhook for error handling. If you are subscribed to the `messages` webhook field, you will receive notification of errors as they occur for supported asynchr

## Experiments
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/support/experiments/

* * *
Resources
# Experiments
Updated: Nov 13, 2025
We occasionally run experiments to help us assess the impact of messaging on WhatsApp user experience and engagement. These are standard practices on our platform and help us improve the messaging experience for both you and your customers.
Ongoing experiments are described below and have no fixed end-date. In order to protect the validity of the experiment and ensure the best possible business and consumer experience, we cannot provide any exceptions or opt-outs for these experiments.
## Marketing message experiment
A very small percentage of WhatsApp users do not receive marketing template messages from any business unless one of the following conditions is met:
a [customer service window](https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/send-messages#customer-service-windows) exists between the user and the business
an open [free entry point window](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing#free-entry-point-windows) exists between the user and the business
If you send a marketing template message to a user who is part of the experiment group, your message

## Messaging and Calling Health Status
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/support/health-status/

* * *
Resources
# Messaging and Calling Health Status
Updated: Oct 22, 2025
This document describes how to determine whether or not you can do messaging and calling successfully using a given API resource.
The following nodes have a `health_status` field:
If you request the `health_status` field on any of these nodes, the API will return a summary of the messaging and calling health of all the nodes involved in messaging/calling requests if using the targeted node. This summary indicates if you will be able to use the API for messaging and calling successfully, or if you will have limited success due to some limitation on one or more nodes, or if you will be prevented from messaging and calling entirely.
## Request Syntax
```
GET /<NODE_ID>?fields=health_status
```
## Response
```
{
"health_status": {
"can_send_message": "<OVERALL_MESSAGING_STATUS>",
"entities": [\
\
/* Only included if targeting a business phone number */\
{\
"entity_type": "PHONE_NUMBER",\
"id": "<BUSINESS_PHONE_NUMBER_ID>",\
"can_send_message": "<BUSINESS_PHONE_NUMBER_MESSAGING_STATUS>",\
"can_receive_call_sip": "<BUSINESS_PHONE_NUMBER_RECEIVE_CALL_SIP_STATUS>",\
},\
\
/* Only included if targeting a template */

## ## This page isn't available right now
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/support/load-testing/

## This page isn't available right now
This may be because of a technical error that we're working to get fixed. Try reloading this page.
Reload Page

## Migrating from On-Premises API to Cloud API
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/support/migrating-from-onprem-to-cloud/

* * *
Resources
# Migrating from On-Premises API to Cloud API
Updated: Nov 5, 2025
This document explains how to migrate business phone numbers from On-Premises API to Cloud API.
Note that migrating a business phone number from one API to another is not the same as [migrating a number from one WhatsApp Business Account (WABA) to another](https://developers.facebook.com/docs/whatsapp/business-management-api/guides/migrate-phone-to-different-waba).
## How It Works
The migration process involves generating metadata about the business phone number, then using that data to register the number for use with Cloud API. This in turn deregisters the number from On-Premises API, since a number can only be registered for use with one API at a time.
Migration does NOT affect:
the business phone number’s display name, verification status, or quality rating
templates used by the business phone number, or their statuses
the owning WABA, its Official Business Account status, or its messaging limit
In order to support migration, however, you must be aware of any [API differences](https://developers.facebook.com/documentation/business-messaging/whatsapp/support/migrating-from-onprem-to-cloud/#api-dif

## Best practices for authenticating users via WhatsApp
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/authentication-templates/authentication-best-practices/

* * *
Resources
# Best practices for authenticating users via WhatsApp
Updated: Nov 21, 2025
## Security
To register with WhatsApp, users must register using their phone number. During [this sign-up process](https://l.facebook.com/l.php?u=https%3A%2F%2Fwww.whatsapp.com%2Fcoronavirus%2Fget-started&h=AT2ThOt4IPcdWKgr0fp7Uh53ErycP21HRGGUxfn9mEk8QIvlxg1Xa2jsBt1h4sQlIDjI0gCqcWlA8o5QWxipchYIKAYCeBm6K4_cY4SeM0DvHXGo-ERpmHP8rZu9PBaWOkC9prMVZlLGCA), WhatsApp verifies the user has ownership of this phone number by sending a 6-digit registration code via SMS or phone call.
For many WhatsApp users, their phone number will continue to be the same as the number they have registered with WhatsApp. However, WhatsApp does not enforce ownership of the phone number past initial registration, so there is no guarantee that a phone number and the WhatsApp account tied to that phone number are owned by the same individual. In particular, since phone numbers are recycled by mobile providers, it is possible that if your user currently owns the phone number and does not use WhatsApp, [the previous owner of that phone number still has access to the WhatsApp account tied to that phone number](https://l.facebo

## ## This page isn't available right now
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/authentication-templates/authentication-templates/

## This page isn't available right now
This may be because of a technical error that we're working to get fixed. Try reloading this page.
Reload Page

## One-tap autofill authentication templates
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/authentication-templates/autofill-button-authentication-templates/

* * *
Resources
# One-tap autofill authentication templates
Updated: Dec 12, 2025
One-tap autofill authentication templates allow you to send a one-time password or code along with an one-tap autofill button to your users. When a WhatsApp user taps the autofill button, the WhatsApp client triggers an activity which opens your app and delivers it the password or code.
![](https://scontent-mia3-2.xx.fbcdn.net/v/t39.2365-6/544891318_1193716362844107_2249981522588832509_n.png?_nc_cat=103&ccb=1-7&_nc_sid=e280be&_nc_ohc=tVKHXKvaRT8Q7kNvwGA9NIg&_nc_oc=AdndpcL4Zgt8bwtwr7qbhubwn9lEJuUNS-81y4GFaqJqdLBQiQD6Cq358ibuN6FLZbU&_nc_zt=14&_nc_ht=scontent-mia3-2.xx&_nc_gid=PBI2pCMKYgEyaqvCwvwD2A&oh=00_AfkDTuBGZfuOjg8hSqYlLXs52BLSIRyDIEqKUiN9_41Qxw&oe=69650481)
One-tap autofill button authentication templates consist of:
Preset text: _<VERIFICATION\_CODE> is your verification code._
An optional security disclaimer: _For your security, do not share this code._
An optional expiration warning (optional): _This code expires in <NUM\_MINUTES> minutes._
A one-tap autofill button.
Notes:
The “I didn’t request a code” button is currently in beta and is being rolled out incrementally to business customers.
The

## Bulk management
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/authentication-templates/bulk-management/

* * *
Resources
# Bulk management
Updated: Nov 10, 2025
Use the [POST /<WABA\_ID>/upsert\_message\_templates](https://developers.facebook.com/docs/graph-api/reference/whats-app-business-account/upsert_message_templates#Creating) endpoint to bulk update or create authentication templates in multiple languages that include or exclude the optional security and expiration warnings.
If a template already exists with a matching name and language, the template will be updated with the contents of the request, otherwise, a new template will be created.
### Request syntax
```
POST /<WHATSAPP_BUSINESS_ACCOUNT_ID>/upsert_message_templates
```
### Post Body
```
{
"name": "<NAME>",
"languages": [<LANGUAGES>],
"category": "AUTHENTICATION",
"components": [\
{\
"type": "BODY",\
"add_security_recommendation": <ADD_SECURITY_RECOMMENDATION> // Optional\
},\
{\
"type": "FOOTER",\
"code_expiration_minutes": <CODE_EXPIRATION_MINUTES> // Optional\
},\
{\
"type": "BUTTONS",\
"buttons": [\
{\
"type": "OTP",\
"otp_type": "<OTP_TYPE>",\
"supported_apps": [\
{\
"package_name": "<PACKAGE_NAME>", // One-tap and zero-tap buttons only\
"signature_hash": "<SIGNATURE_HASH>" // One-tap and zero-tap buttons only\
}\

## ## This page isn't available right now
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/authentication-templates/copy-code-button-authentication-templates/

## This page isn't available right now
This may be because of a technical error that we're working to get fixed. Try reloading this page.
Reload Page

## Error Signals
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/authentication-templates/error-signals/

* * *
Resources
# Error Signals
Updated: Oct 21, 2025
The OTP Android SDK is in beta and features a simplified workflow for implementing one-tap and zero-tap authentication templates. You can learn how to use it below.
This document describes Android-only error signals that can help you debug [one-tap autofill authentication templates](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/authentication-templates/autofill-button-authentication-templates) and [zero-tap authentication templates](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/authentication-templates/zero-tap-authentication-templates).
If your message fails the eligibility check, the one-tap autofill button will be replaced with a copy code button. In addition, there may be device or WhatsApp client settings that prevent message notifications. To help with debugging, our apps surface some error information via the `com.whatsapp.OTP_ERROR` intent. In these situations you will receive an error key and message instead of the user’s one-time passwords or verification code.
Note that some of these error signals will only surface if you are running WhatsApp

## Template previews
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/authentication-templates/template-preview/

* * *
Resources
# Template previews
Updated: Nov 4, 2025
You can generate previews of authentication template text in various languages that include or exclude the security recommendation string and code expiration string using the [**GET /<WABA\_ID>/message\_template\_previews**](https://developers.facebook.com/docs/graph-api/reference/whats-app-business-account/message_template_previews#Reading) endpoint.
### Request syntax
```
GET /<WHATSAPP_BUSINESS_ACCOUNT_ID>/message_template_previews
?category=AUTHENTICATION,
&language=<LANGUAGE>, // Optional
&add_security_recommendation=<ADD_SECURITY_RECOMMENDATION>, // Optional
&code_expiration_minutes=<CODE_EXPIRATION_MINUTES>, // Optional
&button_types=<BUTTON_TYPES> // Optional
```
### Request parameters
| Placeholder | Description | Example Value |
| --- | --- | --- |
| `<LANGUAGE>`<br>_Comma-separated list_ | **Optional.**<br>Comma-separated list of [language and locale codes](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/supported-languages) of language versions you want returned.<br>If omitted, versions of all supported languages will be returned. | `en_US,es_ES` |
| `<ADD_SECURITY_RECOMMENDATIO

## ## This page isn't available right now
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/authentication-templates/zero-tap-authentication-templates/

## This page isn't available right now
This may be because of a technical error that we're working to get fixed. Try reloading this page.
Reload Page

## Template components
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/components/

* * *
Resources
# Template components
Updated: Nov 21, 2025
Templates are made up of four primary components which you define when you create a template: header, body, footer, and buttons. The components you choose for each of your templates should be based on your business needs. The only required component is the body component.
Some components support variables, whose values you can supply when using the Cloud API or On-Premises API to send the template in a template message. If your templates use variables, you must include sample variable values upon template creation.
## Text header
Text headers are optional elements that can be added to the top of template messages. Each template may include only one text header. Please note that markdown special characters are not supported in this component, so we recommend avoiding their use.
Text headers support 1 [parameter](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/overview#parameter-formats).
### Creation syntax
```
<!-- No parameter syntax -->
{
"type": "header",
"format": "text",
"text": "<HEADER_TEXT>"
}
<!-- Named parameter syntax -->
{
"type": "header",
"format": "text",
"text": "<HEADER_

## Marketing templates
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/marketing-templates/

* * *
Resources
# Marketing templates
Updated: Dec 5, 2025
Marketing templates are typically used to drive engagement, brand awareness, and driving sales.
They are the only type of template that can be used with both Cloud API and Marketing Messages API for WhatsApp.
## Custom templates
You can use the [POST /<WHATSAPP\_BUSINESS\_ACCOUNT\_ID>/message\_templates](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-phone-number/message-api#Creating) endpoint to create custom marketing templates that suit your business needs from any supported components.
![](https://scontent-lax3-1.xx.fbcdn.net/v/t39.2365-6/555677225_1191798406305539_8221742988743767334_n.png?_nc_cat=102&ccb=1-7&_nc_sid=e280be&_nc_ohc=GyJWciA2wi4Q7kNvwHPzuIk&_nc_oc=AdmDn92nnYUaY7vWHR3Xs3kf7FHQhsfAhSVTFBnJ3NyLnSF7DjT2b280pF9SLrcxRuI&_nc_zt=14&_nc_ht=scontent-lax3-1.xx&_nc_gid=pCkcFVqVBLeW7mX-PefvhQ&oh=00_Afnnoqn5P76MkLGvt9db2SgsCNiNiedA0CMvAfeZmv3Exg&oe=6964EC23)
See our [custom marketing templates](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/marketing-templates/custom-marketing-templates) document for example of how to create an

## Call permission request message template
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/marketing-templates/call-permission-request-message-template/

* * *
Resources
# Call permission request message template
Updated: Nov 3, 2025
Create a call permission request template message that your business can send to users outside of the customer service window.
![](https://scontent-mia3-3.xx.fbcdn.net/v/t39.2365-6/543369275_3208571362625810_4384114346853497205_n.png?_nc_cat=110&ccb=1-7&_nc_sid=e280be&_nc_ohc=7iPMwiMft3cQ7kNvwGvIGkO&_nc_oc=AdmV8BdIN59a62zQMhooPSy33QOd80CUP6DcJnBV49LLcVV_cLQDCLhTKg5-jGpNQVk&_nc_zt=14&_nc_ht=scontent-mia3-3.xx&_nc_gid=z8xFiHMPgHdHtL8A9do3zQ&oh=00_AfnfAYkTVGcPG-06XZcaIjVKofv88qZYVyjFBAgadIQ3ig&oe=6964E2F0)
## Create call permission request message template
### Request syntax
Use the [POST /<WHATSAPP\_BUSINESS\_ACCOUNT\_ID>/message\_templates](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-account/template-api?locale=en_US#Creating) endpoint to create a call permission request message template.
```
curl -X POST \
'https://graph.facebook.com/<API_VERSION>/<WHATSAPP_BUSINESS_ACCOUNT_ID>/message_templates' \
-H 'Authorization: Bearer <ACCESS_TOKEN>' \
-H 'Content-Type: application/json' \
-d '{
"name": "sample_cpr_template",
"language": "en",
"category": "

## Catalog templates
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/marketing-templates/catalog-templates/

* * *
Resources
# Catalog templates
Updated: Nov 14, 2025
This document explains how to create catalog templates. See [Sell Products & Services](https://developers.facebook.com/documentation/business-messaging/whatsapp/catalogs/sell-products-and-services) to learn more about product catalogs and ways to showcase your products.
Catalog templates are marketing templates that allow you to showcase your product catalog entirely within WhatsApp. Catalog templates display a product thumbnail header image of your choice and custom body text, along with a fixed text header and fixed text sub-header.
![](https://scontent-mia3-2.xx.fbcdn.net/v/t39.2365-6/354047426_125269187252102_7173148343631613735_n.png?_nc_cat=105&ccb=1-7&_nc_sid=e280be&_nc_ohc=OxewdYyumEoQ7kNvwEuSPQ7&_nc_oc=AdnLkYzPdRdQWE40zF5Ulwrwe2AHmoE1wPItApdNBiY8g3qqHqQN4E0s3C810Nzpp0M&_nc_zt=14&_nc_ht=scontent-mia3-2.xx&_nc_gid=lHmiGLJ7gsR42KkOn7FuHw&oh=00_AfkQtvsSGbRbBUhPJySkVKapJg7HyPC7Kj5ExGz2D0FNzA&oe=6964D3A6)
When a customer taps the **View catalog** button in a catalog template message, your product catalog appears within WhatsApp.
![](https://scontent-mia3-3.xx.fbcdn.net/v/t39.2365-6/353808079_9331603410246288_3629219693038

## Coupon code templates
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/marketing-templates/coupon-templates/

* * *
Resources
# Coupon code templates
Updated: Dec 3, 2025
Coupon code templates are marketing templates that display a single copy code button. When tapped, the code is copied to the customer’s clipboard.
![](https://scontent-mia3-2.xx.fbcdn.net/v/t39.2365-6/365756533_1756280054770140_7287687181799037425_n.png?_nc_cat=107&ccb=1-7&_nc_sid=e280be&_nc_ohc=AXQDRii15HMQ7kNvwGr0VeN&_nc_oc=AdmJtsgAEvKcysfyN783oEFaHiNOWBY8h9jtJRSc2dF87RVtZnXT2PgziQyJNrWaEks&_nc_zt=14&_nc_ht=scontent-mia3-2.xx&_nc_gid=U6oLI6GzLb2ta26EX7bZ6g&oh=00_AfkGbUszfdvk6q86lNfPX9WIWrvKXCEtuC-2Ugu_JKiWvQ&oe=6964F3A5)
## Limitations
Coupon code templates are currently not supported by the WhatsApp web client.
Copy code button text cannot be customized.
Templates are limited to one copy code button.
## Creating coupon code templates
Use the [POST /<WHATSAPP\_BUSINESS\_ACCOUNT\_ID>/message\_templates](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-account/template-api) endpoint to create coupon code templates.
### Request syntax
```
curl 'https://graph.facebook.com/<API_VERSION>/<WHATSAPP_BUSINESS_ACCOUNT_ID>/message_templates' \
-H 'Content-Type: application/json'

## Custom marketing templates
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/marketing-templates/custom-marketing-templates/

* * *
Resources
# Custom marketing templates
Updated: Nov 14, 2025
Learn how to create and send a custom marketing template.
![](https://scontent-mia3-1.xx.fbcdn.net/v/t39.2365-6/555070362_1180641373877493_714272106387148710_n.png?_nc_cat=111&ccb=1-7&_nc_sid=e280be&_nc_ohc=e5BsCO7e9zUQ7kNvwHAaXbl&_nc_oc=Adlxxev6wU3N7UaZE34536w-7HkVv_kvuleI0n9IkJZMeFZvtR6MRASodaXsWJ445qM&_nc_zt=14&_nc_ht=scontent-mia3-1.xx&_nc_gid=FL4wEvauuq_LrwEaNWImjA&oh=00_AfnHX7LrgPtduiuQJqstoN9HgS8x87Iyfumbz7hVeMx3Fg&oe=6964EA2A)
## Supported components
Custom marketing templates support the following components:
1 header (optional; all types supported)
1 body (required)
1 footer (optional)
Up to 10 buttons (optional; all types supported)
## Create a custom marketing template
Use the [POST /<WHATSAPP\_BUSINESS\_ACCOUNT\_ID>/message\_templates](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-phone-number/message-api#Creating) endpoint to create a custom marketing template.
### Request syntax
This example syntax creates a template with an image header, body text with 3 named parameters, a footer, and 3 buttons (url, phone number, and quick-reply).
```
curl 'ht

## Limited-time offer templates
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/marketing-templates/limited-time-offer-templates/

* * *
Resources
# Limited-time offer templates
Updated: Nov 4, 2025
This document describes limited-time offer templates and how to use them.
Limited-time offer templates allow you to display expiration dates and running countdown timers for offer codes in template messages, making it easy for you to communicate time-bound offers and drive customer engagement.
![](https://scontent-mia3-3.xx.fbcdn.net/v/t39.2365-6/385485492_1044097420371007_6435130166952753459_n.png?_nc_cat=110&ccb=1-7&_nc_sid=e280be&_nc_ohc=1Urg0uAkjjEQ7kNvwGK5vG7&_nc_oc=Adm7FeXblt_A33LnizUJFVApui-z_ki-wcj2PWd17IZEZ7wKc88CEuPXPRJw7u2w394&_nc_zt=14&_nc_ht=scontent-mia3-3.xx&_nc_gid=trDk2NGimNns4UmbTN5I8A&oh=00_AfnaMghwWkwBCzmVQi3CDrn4xUHvNiXKqbhgLR6ij-ykfg&oe=696505FF)
## Limitations
Only templates categorized as `MARKETING` are supported.
Footer components are not supported.
Users who view a limited-time offer template message using that WhatsApp web app or desktop app will not see the offer, but will instead see a message indicating that they have received a message but that it’s not supported in the client they are using.
## Creating limited-time offer templates
Use the [WhatsApp Business Account > Message Templa

## Media card carousel templates
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/marketing-templates/media-card-carousel-templates/

* * *
Resources
# Media card carousel templates
Updated: Nov 4, 2025
Media card carousel templates allow you to send a single **marketing template** message accompanied by a set of up to 10 product media cards in a horizontally scrollable view:
![](https://scontent-mia3-2.xx.fbcdn.net/v/t39.2365-6/461961248_1048610163180196_3907313698557856900_n.png?_nc_cat=107&ccb=1-7&_nc_sid=e280be&_nc_ohc=7DinS6ikEkYQ7kNvwGSFc63&_nc_oc=Adlfhg3jGu6UXX1N_tva_UaONo46LKWRl4JubjjNNNlRcfxalIVUXLc4Njj-JZHj-QE&_nc_zt=14&_nc_ht=scontent-mia3-2.xx&_nc_gid=7eirt6naSuG3wsXiO91iug&oh=00_Afl0IyyMbjREBQ_veiqT5mcCOKsBD0L1AXndFtqj9cIXHg&oe=6964F4BC)
When a user taps a media card’s **URL** button to buy a product, the URL mapped to the button is loaded in the device’s default web browser, thus taking the user out of the WhatsApp client experience. If you prefer to keep the user in the WhatsApp client, see [Product Card Carousel Templates](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/marketing-templates/product-card-carousel-templates). Note that carousel cards are only available for marketing template messages.
## Media cards
Carousel templates consist of a message body text

## Multi-product message templates
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/marketing-templates/mpm-templates/

* * *
Resources
# Multi-product message templates
Updated: Nov 4, 2025
This document describes multi-product message (“MPM”) templates, their uses, and how to use them.
MPM templates are marketing templates that allow you to showcase up to 30 products from your ecommerce catalog, organized in up to 10 sections, in a single message.
![](https://scontent-mia3-2.xx.fbcdn.net/v/t39.2365-6/345336924_1476472873159435_9050004394387774321_n.png?_nc_cat=105&ccb=1-7&_nc_sid=e280be&_nc_ohc=Cc5e0CKd5IwQ7kNvwFHLBn5&_nc_oc=AdkMcgHWANVtJEgTJRUvHwsdbqbyut2QDpMR1inhYuViKq1TYmXionIEkCMSJkria3U&_nc_zt=14&_nc_ht=scontent-mia3-2.xx&_nc_gid=ywHaNbgSjUKw-e8WQ7Ioxg&oh=00_AflbEs1MqjTu4De9ed2p3nd0nttZQQ9I-Bula8TEjR2-TQ&oe=6964F75C)
Customers can browse products and sections within the message, view details for each product, add and remove products from their cart, and submit their cart to place an order. Orders are then sent to you via a webhook.
![](https://scontent-mia5-1.xx.fbcdn.net/v/t39.2365-6/345301814_777009393786308_8675106872073624223_n.png?_nc_cat=101&ccb=1-7&_nc_sid=e280be&_nc_ohc=jBcaBUXvwhMQ7kNvwFAM46z&_nc_oc=AdnAcvZdi9yAS4vvY8Oz_udRAiNLVeJoW-NiT2ItW-4rWNWXcaOMl4bNrWGvbyZj1jY&_nc_zt=14&_nc_ht=

## Per-user marketing template message limits
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/marketing-templates/per-user-limits/

* * *
Resources
# Per-user marketing template message limits
Updated: Dec 12, 2025
**Upcoming changes**
_Starting March 3, 2025_, we will take into account the overall volume of personal and business messages in a user’s inbox in addition to their recent marketing message read rates when determining if a given WhatsApp user should receive fewer marketing template messages, and what their limit should be. This means that if a person has low inbox activity or they have not engaged with many of the marketing messages they received lately they may receive fewer marketing messages to ensure a healthy balance of messages in their inbox. From late Q2 we will also align the per user marketing limit with upcoming per-message pricing changes so that all marketing messages delivered will now count towards the per user marketing limit.
_Starting April 1, 2025_, we will temporarily pause delivery of all marketing template messages to WhatsApp users who have a United States phone number (a number composed of a +1 dialing code and a US area code). This pause is intended to allow us to focus on building a better consumer experience in the US, which will ultimately lead to improved outcomes for bus

## Product card carousel templates
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/marketing-templates/product-card-carousel-templates/

* * *
Resources
# Product card carousel templates
Updated: Nov 4, 2025
Product card carousel templates allow you to send a single text message accompanied by a set of up to 10 product cards in a horizontally scrollable view:
![](https://scontent-mia3-3.xx.fbcdn.net/v/t39.2365-6/456451243_832660229062364_6760679807399209749_n.png?_nc_cat=108&ccb=1-7&_nc_sid=e280be&_nc_ohc=eiusPkvTXxgQ7kNvwGx-Cjy&_nc_oc=AdlI3XaDhV7LjKePQiL9WmtkTOvVeR73z6SwHjryUfO66cqN57E3jkD6Z3LH6DC5u98&_nc_zt=14&_nc_ht=scontent-mia3-3.xx&_nc_gid=oMe5PWduye7_QG5NmD3tkQ&oh=00_AflL6FTDgJezAXS-jXPMCNaceMVCRPKa8YDpoqs3x6O_YQ&oe=6964DBA3)
When a WhatsApp user taps the **View** button, they can view more information about the product, add the product to a shopping cart, and place an order, all without leaving the WhatsApp client experience. If instead you prefer to send the user to your website when they click the button, see [Media Card Carousel Templates](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/marketing-templates/media-card-carousel-templates).
## Product cards
Carousel templates support up to 10 product cards, composed of message body text, a product image, product title, pro

## Single-product message templates
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/marketing-templates/spm-templates/

* * *
Resources
# Single-product message templates
Updated: Nov 4, 2025
This document describes single-product message (SPM) templates, their uses, and how to use them.
SPM templates are marketing templates that allow you to present a single product from your ecommerce catalog, accompanied by a product image, product title, and product price (all pulled from your product within your catalog), along with customizable body text, optional footer text, and an interactive **View** button.
![](https://scontent-mia3-1.xx.fbcdn.net/v/t39.2365-6/456611074_369667709517740_8197750041061962345_n.png?_nc_cat=111&ccb=1-7&_nc_sid=e280be&_nc_ohc=DxclJjw9KJ0Q7kNvwHWgz0a&_nc_oc=Adnft9CzeMcpA4WH6yD4mpmfZCw7HiV_TH5xlXB8vVW7JbXyjuBgf-mZF71OxhtcPcw&_nc_zt=14&_nc_ht=scontent-mia3-1.xx&_nc_gid=wQ-in5sjBuhBT6rFORXABg&oh=00_AflDcoF4JeklzlGRV2efqUiJaZNuYsQ64tO_AJO3KCepTQ&oe=6965054A)
WhatsApp users can tap the button to see details about the product, and can add or remove the product from the WhatsApp shopping cart:
![](https://scontent-mia3-3.xx.fbcdn.net/v/t39.2365-6/455731119_491422670275236_7231575948344280249_n.png?_nc_cat=109&ccb=1-7&_nc_sid=e280be&_nc_ohc=bkkFj3TNPVwQ7kNvwGEWgmy&_nc_oc=AdlS-bbEGDjGxGr

## Templates
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/overview/

* * *
Resources
# Templates
Updated: Dec 5, 2025
Learn about templates, their uses and limitations, and the various types of templates you can create.
Templates are WhatsApp Business Account assets that can be sent in template messages via Cloud API or Marketing Messages API for WhatsApp. Template messages are the only type of message that can be sent to WhatsApp users outside of a [customer service window](https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/send-messages#customer-service-windows), so templates are commonly used when messaging users in bulk, or when you need to message a user, but no customer service window is open between you and the user.
## Creation
Use the [POST /<WHATSAPP\_BUSINESS\_ACCOUNT\_ID>/message\_templates](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-account/template-api#post-version-waba-id-message-templates) endpoint or [message templates panel](https://business.facebook.com/latest/whatsapp_manager/message_templates) in WhatsApp Manager to create a template.
Template creation via API uses a common syntax. The bulk of the variation occurs in the category string, w

## Business portfolio pacing
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/portfolio-pacing/

* * *
Resources
# Business portfolio pacing
Updated: Dec 8, 2025
This feature is being released gradually over the coming weeks so may not apply to you immediately.
Business portfolio pacing is a template message delivery batching mechanism that allows time to gather feedback on any template sent as part of a large-scale messaging campaign.
Note that business portfolio pacing is different from [template pacing](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-pacing), which only affects marketing and utility templates.
Business portfolio pacing applies to:
business portfolios that have sent less than 500K template messages collectively, across all of their business phone numbers, within a moving 365-day lookback period
business portfolios that are currently being monitored for suspicious activity (for example, for violating our [WhatsApp Business Messaging Policy](https://l.facebook.com/l.php?u=https%3A%2F%2Fbusiness.whatsapp.com%2Fpolicy&h=AT0BWz4HiMkzOiJT8TDEbjATHi0Iy2nyQRG_Fs7dvDsd6bT3QE_q5IamLA8uKGjGxzFRB2TBwwx4bNRBr4rs7tHm9zqKIgyWRMKYr01rn8Iit6o6XN2unh792KQ43A0lkTkRTO5wvWY0bQ) or [WhatsApp Messaging Guidelines](https://l.facebook.com

## ## This page isn't available right now
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/supported-languages/

## This page isn't available right now
This may be because of a technical error that we're working to get fixed. Try reloading this page.
Reload Page

## Tap target title URL override
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/tap-target-url-title-override/

* * *
Resources
# Tap target title URL override
Updated: Nov 13, 2025
This document explains how to send approved message templates using the `tap_target_configuration` component within a template message. Tap target override enables image-based, text-based, and header-less message templates to function as interactive Call-to-Action URL buttons. These buttons display a custom title and open the destination linked to the first URL button.
WhatsApp Business Accounts (WABAs) must be fully verified and consistently maintain high-quality standards to ensure compliance and access to this component.
![](https://scontent-mia3-3.xx.fbcdn.net/v/t39.2365-6/520579996_716872931262110_1406523760843053750_n.png?_nc_cat=109&ccb=1-7&_nc_sid=e280be&_nc_ohc=i_LlGUn38IcQ7kNvwGKT6M2&_nc_oc=AdmK58HoRRpR8uTANIIK0tXeEN-aWuF2CG8AXfG9eEmVZXty9TuKJsD_ozDZTQgs5L4&_nc_zt=14&_nc_ht=scontent-mia3-3.xx&_nc_gid=4s3uaO3uLm0J7ytZKp-OuA&oh=00_Afnh7zCwzVt1Kc5iGmG3NHOoIsDS92B8j7uCjClhy8TNiQ&oe=6964F8F5)
## Request syntax
Use the [POST /<WHATSAPP\_BUSINESS\_PHONE\_NUMBER\_ID>/messages](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-phone-number/message-api) endpoint

## Template categorization
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-categorization/

* * *
Resources
# Template categorization
Updated: Nov 14, 2025
When creating a new template, or managing existing ones, it’s important to understand how WhatsApp categorizes your template for pricing purposes.
Consider template category guidelines before creating a new template
Stay updated on your template’s approval status after template creation
Learn about automatic category updates to templates in production
_**This information is also available in PDF form in our [Message templates category guidelines explainer PDF](https://l.facebook.com/l.php?u=https%3A%2F%2Fscontent-lax3-1.xx.fbcdn.net%2Fv%2Ft39.8562-6%2F522646671_1032957015586071_352200442705405080_n.pdf%3F_nc_cat%3D108%26ccb%3D1-7%26_nc_sid%3Db8d81d%26_nc_ohc%3DhZxgquSQpwoQ7kNvwEo3aFW%26_nc_oc%3DAdlgoQVYirRTbaiFz8DQJYmzFqhWeWyluiUyjoL3usm1LQME2UM0xMA1sqFHX32u4uM%26_nc_zt%3D14%26_nc_ht%3Dscontent-lax3-1.xx%26_nc_gid%3D6DlBe7PMy7ZKHMmFrwshXA%26oh%3D00_AflDgbMJThQQ3ttFOKQONm5Gt2IfcjUGuTruJOjbXdgYJA%26oe%3D69508EE2&h=AT3B9-fZ_E5JP8utwdc9nYZSrG4VVKg878lyN1Q-eMgBZbdWfroqklI5UA9kLV-PzpkAkppEdwkFSeEIh0qABa-aXwjuL3wbW_8dYqVC3e_m4mMAjWjkDkUwb0yAW0WB-8cSSFkCKoCAyg)**_
_**.**_
## Template category guidelines
Our template category g

## ## This page isn't available right now
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-comparison/

## This page isn't available right now
This may be because of a technical error that we're working to get fixed. Try reloading this page.
Reload Page

## Template Library
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-library/

* * *
Resources
# Template Library
Updated: Nov 14, 2025
Template Library makes it faster and easier for businesses to create utility templates for common use cases, like payment reminders, delivery updates — and authentication templates for common identity verification use cases.
These pre-written templates have already been categorized as utility or authentication. Library templates contain fixed content that cannot be edited and parameters you can adapt for business or user-specific information.
You can browse and create templates using Template Library in WhatsApp Manager, or programmatically via the API.
## Creating Templates via WhatsApp Manager (WAM)
Follow the instructions below to create templates using the Template Library in [WhatsApp Manager](https://business.facebook.com/wa/manage/template-library).
1: In the sidebar of WAM, under **Message Templates**, select **Create Template**.
![Image](https://scontent-mia3-2.xx.fbcdn.net/v/t39.2365-6/564050140_1339317901260194_2215442945738675402_n.jpg?_nc_cat=107&ccb=1-7&_nc_sid=e280be&_nc_ohc=nxT8mTe_x_AQ7kNvwFbI-Zi&_nc_oc=AdmE9uiaWTkOkV21TrzDCk3x8EsOn16FMltQY8XFt7vEnKmO3vUuSyCH-XOGjJtvIEo&_nc_zt=14&_nc_ht=scontent-mia3-2.xx&_nc

## Template management
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-management/

* * *
Resources
# Template management
Updated: Nov 14, 2025
Learn about common endpoints used to manage templates.
## Get templates
Use the [`GET/<WHATSAPP_BUSINESS_ACCOUNT_ID>/message_templates`](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-account/template-api?#Reading) endpoint to get a list of templates in a WhatsApp Business Account.
### Get all templates
Example request to get all templates (default fields):
```
curl 'https://graph.facebook.com/v23.0/102290129340398/message_templates' \
-H 'Authorization: Bearer EAAJB...'
```
Example response, truncated (`...`) for brevity:
```
{
"data": [\
{\
"name": "reservation_confirmation",\
"parameter_format": "NAMED",\
"components": [\
{\
"type": "HEADER",\
"format": "IMAGE",\
"example": {\
"header_handle": [\
"https://scontent.whatsapp.net/v/t61..."\
]\
}\
},\
{\
"type": "BODY",\
"text": "*You're all set!*\n\nYour reservation for {{number_of_guests}} at Lucky Shrub Eatery on {{day}}, {{date}}, at {{time}}, is confirmed. See you then!",\
"example": {\
"body_text_named_params": [\
{\
"param_name": "number_of_guests",\
"example": "4"\
},\
{\
"param_name": "day",\
"example": "Saturd

## ## This page isn't available right now
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-media/

## This page isn't available right now
This may be because of a technical error that we're working to get fixed. Try reloading this page.
Reload Page

## Template migration
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-migration/

* * *
Resources
# Template migration
Updated: Nov 14, 2025
This document describes how to migrate templates from one WhatsApp Business Account (WABA) to another. Note that migration doesn’t move templates, it recreates them in the destination WABA.
## Limitations
Templates can only be migrated between WABAs owned by the same Meta business.
Only templates with a status of `APPROVED` and a `quality_score` of either `GREEN` or `UNKNOWN` are eligible for migration.
## Request syntax
Use the [WhatsApp Business Account > Migrate Message Templates](https://developers.facebook.com/docs/graph-api/reference/whats-app-business-account/migrate_message_templates) endpoint to migrate templates from one WABA to another.
```
curl -X POST "https://graph.facebook.com/<API_VERSION>/<DESTINATION_WABA_ID>/migrate_message_templates" \
-H "Authorization: Bearer <ACCESS_TOKEN>" \
-H "Content-Type: application/json" \
-d '
{
"source_waba_id": "<SOURCE_WABA_ID>",
"page_number": <PAGE_NUMBER>,
"count": <COUNT>
<!-- only if migrating specific templates that failed to migrate -->
"template_ids": [<TEMPLATE_IDS>]
}'
```
### Parameters
| Placeholder | Description | Example Value |
| --- | --- | --- |
| `<ACCESS_

## Template pacing
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-pacing/

* * *
Resources
# Template pacing
Updated: Dec 8, 2025
Template pacing is a mechanism that allows time for customers to provide early feedback on templates. This identifies and [pauses templates](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-pausing) that have received poor feedback or engagement, giving you enough time to adjust their contents before they are sent to too many customers, thereby reducing the likelihood of negative feedback impacting your business.
Template pacing is valid for marketing and utility templates. Newly created templates, paused templates that are unpaused, and templates that may have been created previously but don’t have a `GREEN` quality rating are potentially subject to pacing. Template quality history — for example, low quality resulting in a template pause — is one of the primary reasons for template pacing and you may see other templates get paced.
When a template is paced, messages will be sent normally until an unspecified threshold is reached. Once this threshold is reached, subsequent messages using that template will be held to allow enough time for customer feedback. Once we receive a good quali

## ## This page isn't available right now
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-pausing/

## This page isn't available right now
This may be because of a technical error that we're working to get fixed. Try reloading this page.
Reload Page

## Template quality rating
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-quality/

* * *
Resources
# Template quality rating
Updated: Oct 29, 2025
Every template has a quality rating based on usage, customer feedback, and engagement. Templates can have the following ratings, as reported by the API:
`GREEN` — Indicates high quality. The template has received little to no negative feedback from WhatsApp users. The template can be sent.
`YELLOW` — Indicates medium quality. The template has received negative feedback from multiple WhatsApp users, or low read-rates, and may soon become paused or disabled. Message templates with this status can still be sent.
`RED` — Indicates low quality. The template has received negative feedback from multiple WhatsApp users, or low read-rates. The template can be sent, but is in danger of being paused or disabled soon. We recommend that you address the issues that users are reporting. are reporting.
`UNKNOWN` — Indicates a quality score is still pending, because it has yet to receive WhatsApp user feedback or read-rate data. The template can be sent.
Newly created templates have a quality score of `UNKNOWN`, but their rating will change automatically as usage, feedback, and engagement signal is collected over time.
Quality ratings

## ## This page isn't available right now
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-review/

## This page isn't available right now
This may be because of a technical error that we're working to get fixed. Try reloading this page.
Reload Page

## Time-to-live
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/time-to-live/

* * *
Resources
# Time-to-live
Updated: Oct 31, 2025
If we are unable to deliver a message to a WhatsApp user, we will retry the delivery for a period of time known as a time-to-live (“TTL”), or the message validity period.
You can customize the default TTL for authentication and utility templates sent via Cloud API, and for marketing templates sent via Marketing Messages Lite API (“MM Lite API”).
We encourage you to set a TTL for all of your authentication templates, preferably equal to or less than your code expiration time, to ensure your customers only get a message when a code is still usable.
## Defaults, Min/Max Values, and Compatibility Table
|  | Authentication | Utility | Marketing |
| --- | --- | --- | --- |
| **Default TTL** | 10 minutes<br>30 days for authentication templates created before October 23, 2024 | 30 days | 30 days |
| **Compatibility** | Cloud API + On-Premise API | Cloud API only | Marketing Messages (MM) Lite API |
| **Customizable range** | 30 seconds to 15 minutes | 30 seconds to 12 hours | 12 hours to 30 days |
## Customize the TTL
To set a custom TTL on an authentication, utility, or marketing template, include and set the value of the `message_send_

## ## This page isn't available right now
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/utility-templates/utility-templates/

## This page isn't available right now
This may be because of a technical error that we're working to get fixed. Try reloading this page.
Reload Page

## Throughput
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/throughput/

* * *
Resources
# Throughput
Updated: Nov 21, 2025
For each registered business phone number, Cloud API supports up to 80 messages per second (mps) by default, and up to [1,000 mps](https://developers.facebook.com/documentation/business-messaging/whatsapp/throughput/#higher-throughput) by automatic upgrade.
Throughput is inclusive of inbound and outbound messages and all message types. Note that business phone numbers, regardless of throughput, are still subject to their WhatsApp Business Account [rate limit](https://developers.facebook.com/documentation/business-messaging/whatsapp/about-the-platform#rate-limits) and [template messaging limits](https://developers.facebook.com/documentation/business-messaging/whatsapp/messaging-limits).
If you attempt to send more messages than your current throughput level allows, the API will return error code `130429` until you are within your allowed level again. Also, throughput levels are intended for messaging campaigns involving different WhatsApp user phone numbers. If you attempt to send too many messages to the same WhatsApp user number, you may encounter a pair [rate limit](https://developers.facebook.com/documentation/business-messaging

## Typing indicators
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/typing-indicators/

* * *
Resources
# Typing indicators
Updated: Oct 21, 2025
When you get a **messages** webhook indicating a [received message](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages), you can use the `message.id` value to mark the message as read and display a typing indicator so the WhatsApp user knows you are preparing a response. This is good practice if it will take you a few seconds to respond.
![](https://scontent-mia3-3.xx.fbcdn.net/v/t39.2365-6/488360772_654124507349470_2240843625651955811_n.png?_nc_cat=110&ccb=1-7&_nc_sid=e280be&_nc_ohc=24mJNJRvW08Q7kNvwFooxhz&_nc_oc=Adm4hyxu9yvJk-kH4bf3gxH3E8NrfWfhxF62VGOdN2Y1n_vPzFBP1wVboO933qWzaac&_nc_zt=14&_nc_ht=scontent-mia3-3.xx&_nc_gid=MAEAIwOq3HLPofYCaylhKA&oh=00_AfnCriaRf1QDRsDE5A0jKvgp1CJOB4LlRIRUmzu7cPSNxA&oe=6964D3DC)
The typing indicator will be dismissed once you respond, or after 25 seconds, whichever comes first. To prevent a poor user experience, only display a typing indicator if you are going to respond.
## Request syntax
```
curl -X POST \
'https://graph.facebook.com/<API_VERSION>/<WHATSAPP_BUSINESS_PHONE_NUMBER_ID>/messages'
-H 'Authorization: Bearer <ACCESS_TOKEN>' \
-H '

## Upcoming changes to messaging limits
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/upcoming-messaging-limits-changes/

* * *
Resources
# Upcoming changes to messaging limits
Updated: Oct 26, 2025
The changes described in this document are now live, and are only here for reference purposes. Our [Messaging limits](https://developers.facebook.com/documentation/business-messaging/whatsapp/messaging-limits) document has been updated to reflect these changes.
Messaging limits are currently calculated and set on a per-number basis. **Starting October 7, 2025**, messaging limits will instead be calculated and set on a business portfolio basis, and will be shared by all business phone numbers within each portfolio.
Existing business portfolios will have their messaging limit set to the highest limit of any phone number within their portfolio (e.g. if a portfolio has a phone number with a limit of 100K and other phone numbers with lower limits, the portfolio’s limit will be set to 100K).
These changes will result in:
**Faster access to higher limits**, with upgrades within 6 hours (compared to the current 24 hours) and immediate access to the portfolio’s limits for newly registered numbers.
**Greater flexibility**, allowing you to have as many phones as needed without requiring additional phones to access hi

## ## This page isn't available right now
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/create-webhook-endpoint/

## This page isn't available right now
This may be because of a technical error that we're working to get fixed. Try reloading this page.
Reload Page

## ## This page isn't available right now
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/message_echoes/

## This page isn't available right now
This may be because of a technical error that we're working to get fixed. Try reloading this page.
Reload Page
* * *

## Webhook overrides
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/override/

* * *
Resources
# Webhook overrides
Updated: Nov 7, 2025
[Messages](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages) webhooks are sent to the callback URL set on your app, but you can override this for your own app by designating an alternate callback URL for the WhatsApp Business Account (WABA) or business phone number.
When a messages webhook is triggered, we will first check if your app has designated an alternate callback URL for the business phone number associated with the message. If set, we will send the webhook to your alternate callback URL. If the phone number has no alternate, we will check if the WABA associated with the number has an alternate callback URL, and if set, send it there. If the WABA also has no alternate, we will then fallback to your app’s callback URL.
## Requirements
Before setting an alternate callback URL, make sure your app is [subscribed to webhooks for the WABA](https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/manage-webhooks#subscribe-to-a-whatsapp-business-account) and verify that your alternate callback endpoint can receive and process messages web

## Webhooks
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/overview/

* * *
Resources
# Webhooks
Updated: Dec 2, 2025
This document describes webhooks and how they are used by the WhatsApp Business Platform.
Webhooks are HTTP requests containing JSON payloads that are sent from Meta’s servers to a server of your designation. The WhatsApp Business Platform uses webhooks to inform you of incoming messages, the status of outgoing messages, and other important information, such as changes to your account status, messaging capability upgrades, and changes to your template quality scores.
For example, this is a webhook describing a message sent from a WhatsApp user to a business:
```
{
"object": "whatsapp_business_account",
"entry": [\
{\
"id": "102290129340398",\
"changes": [\
{\
"value": {\
"messaging_product": "whatsapp",\
"metadata": {\
"display_phone_number": "15550783881",\
"phone_number_id": "106540352242922"\
},\
"contacts": [\
{\
"profile": {\
"name": "Sheena Nelson"\
},\
"wa_id": "16505551234"\
}\
],\
"messages": [\
{\
"from": "16505551234",\
"id": "wamid.HBgLMTY1MDM4Nzk0MzkVAgASGBQzQTRBNjU5OUFFRTAzODEwMTQ0RgA=",\
"timestamp": "1749416383",\
"type": "text"\
"text": {\
"body": "Does it come in another color?"\
}\
]\
},\
"field": "messages"\
}\
]\

## account\_alerts webhook reference
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/account_alerts/

* * *
Resources
# account\_alerts webhook reference
Updated: Nov 25, 2025
This reference describes trigger events and payload contents for the WhatsApp Business Account `account_alerts` webhook.
The **account\_alerts** webhook notifies you of changes to a business phone number’s [messaging limit](https://developers.facebook.com/documentation/business-messaging/whatsapp/messaging-limits), [business profile](https://developers.facebook.com/documentation/business-messaging/whatsapp/business-phone-numbers/phone-numbers#business-profiles), and [Official Business Account](https://developers.facebook.com/documentation/business-messaging/whatsapp/whatsapp-business-accounts#official-business-account) status.
## Triggers
An increase to the messaging limit of all of a business portfolio’s phone numbers is denied, a decision on the increase has been deferred, or more information is needed before a decision can be made.
A business phone number Official Business Account status is approved or denied.
A business phone number’s business profile photo is deleted.
## Syntax
```
{
"object": "whatsapp_business_account",
"entry": [\
{\
"id": "<WHATSAPP_BUSINESS_ACCOUNT_ID>",\
"time": <WEBHOOK_TRIGGER_TI

## account\_review\_update webhook reference
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/account_review_update/

* * *
Resources
# account\_review\_update webhook reference
Updated: Oct 22, 2025
This reference describes trigger events and payload contents for the WhatsApp Business Account `account_review_update` webhook.
The **account\_review\_update** webhook notifies you when a WhatsApp Business Account has been reviewed against our policy guidelines.
## Triggers
A WhatsApp Business Account is approved.
A WhatsApp Business Account is rejected.
A decision on a WhatsApp Business Account approval has been deferred or is awaiting more information.
## Syntax
```
{
"entry": [\
{\
"id": "<WHATSAPP_BUSINESS_ACCOUNT_ID>",\
"time": <WEBHOOK_TRIGGER_TIMESTAMP>,\
"changes": [\
{\
"value": {\
"decision": "<DECISION>"\
},\
"field": "account_review_update"\
}\
]\
}\
],
"object": "whatsapp_business_account"
}
```
## Payload parameters
| Placeholder | Description | Example value |
| --- | --- | --- |
| `<DECISION>`<br>_String_ | Indicates WhatsApp Business Account (“WABA”) review outcome.<br>Values can be:<br>`APPROVED` — Indicates WABA approved and ready for use.<br>`REJECTED` — Indicates WABA was rejected because it doesn’t meet our policy requirements and cannot be used with our APIs.<br>`PENDING` — Indi

## account\_update webhook reference
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/account_update/

* * *
Resources
# account\_update webhook reference
Updated: Dec 5, 2025
This reference describes trigger events and payload contents for the WhatsApp Business Account **account\_update** webhook.
The **account\_update** webhook notifies of changes to a WhatsApp Business Account’s [partner-led business verification](https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/partner-led-business-verification) submission, its [authentication-international rate](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/authentication-international-rates) eligibility or primary business location, when it is shared with a [solution provider](https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/overview), [policy or terms violations](https://developers.facebook.com/documentation/business-messaging/whatsapp/policy-enforcement), or when it is deleted.
## Triggers
A WhatsApp Business Account’s partner-led business verification submission is approved, rejected, or discarded.
A WhatsApp Business Account is deleted.
A WhatsApp Business Account is shared (“installed”) or unshared (“uninstalled”) wi

## business\_capability\_update webhook reference
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/business_capability_update/

* * *
Resources
# business\_capability\_update webhook reference
Updated: Nov 14, 2025
This reference describes trigger events and payload contents for the WhatsApp Business Account **business\_capability\_update** webhook.
The **business\_capability\_update** webhook notifies you of WhatsApp Business Account or business portfolio capability changes ( [messaging limits](https://developers.facebook.com/documentation/business-messaging/whatsapp/messaging-limits#increasing-your-limit), [phone number limits](https://developers.facebook.com/documentation/business-messaging/whatsapp/business-phone-numbers/phone-numbers#registered-number-cap), etc.).
## Triggers
A WhatsApp Business Account is created.
A WhatsApp Business Account or business portfolio business capability (e.g. [messaging limits](https://developers.facebook.com/documentation/business-messaging/whatsapp/messaging-limits#increasing-your-limit), [phone number limits](https://developers.facebook.com/documentation/business-messaging/whatsapp/business-phone-numbers/phone-numbers#registered-number-limits)) is increased or decreased.
## Syntax
```
{
"entry": [\
{\
"id": "<WHATSAPP_BUSINESS_ACCOUNT_ID>",\
"time": <WEBHOOK_TRIGGER_TI

## history webhook reference
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/history/

* * *
Resources
# history webhook reference
Updated: Dec 12, 2025
This reference describes trigger events and payload contents for the WhatsApp Business Account `history` webhook.
The **history** webhook is used to synchronize the [WhatsApp Business app chat history](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users) of a business customer onboarded by a solution provider.
## Triggers
a solution provider [synchronize the WhatsApp Business app chat history](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users#synchronizing-whatsapp-business-app-data) of a business customer who they have onboarded with a WhatsApp Business app phone number, and who has agreed to share their chat history
a solution provider [synchronize the WhatsApp Business app chat history](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users#synchronizing-whatsapp-business-app-data) of a business customer who they have onboarded with a WhatsApp Business app phone number, but the customer has declined to share their

## message\_template\_components\_update webhook reference
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/message_template_components_update/

* * *
Resources
# message\_template\_components\_update webhook reference
Updated: Nov 14, 2025
This reference describes trigger events and payload contents for the WhatsApp Business Account `message_template_components_update` webhook.
The **message\_template\_components\_update** webhook notifies you of changes to a template’s components.
## Triggers
A template is edited.
## Syntax
```
{
"entry": [\
{\
"id": "<WHATSAPP_BUSINESS_ACCOUNT_ID>",\
"time": <WEBHOOK_TRIGGER_TIMESTAMP>,\
"changes": [\
{\
"value": {\
"message_template_id": <TEMPLATE_ID>,\
"message_template_name": "<TEMPLATE_NAME>",\
"message_template_language": "<TEMPLATE_LANGUAGE_AND_LOCALE_CODE>",\
"message_template_element": "<TEMPLATE_BODY_TEXT>,\
\
<!-- only included if template has a text header -->\
"message_template_title": "<TEMPLATE_HEADER_TEXT>",\
\
<!-- only included if template has a footer -->\
"message_template_footer": "<TEMPLATE_FOOTER_TEXT>",\
\
<!-- only included if template has a url or phone number button -->\
"message_template_buttons": [\
{\
"message_template_button_type": "<BUTTON_TYPE>",\
"message_template_button_text": "<BUTTON_LABEL_TEXT>",\
\
<!--only included for url buttons -->\
"message_temp

## message\_template\_quality\_update webhook reference
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/message_template_quality_update/

* * *
Resources
# message\_template\_quality\_update webhook reference
Updated: Oct 22, 2025
This reference describes trigger events and payload contents for the WhatsApp Business Account `message_template_quality_update` webhook.
The **message\_template\_quality\_update** webhook notifies you of changes to a template’s [quality score](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-quality).
## Triggers
A template’s quality score changes.
## Syntax
```
{
"entry": [\
{\
"id": "<WHATSAPP_BUSINESS_ACCOUNT_ID>",\
"time": <WEBHOOK_TRIGGER_TIMESTAMP>,\
"changes": [\
{\
"value": {\
"previous_quality_score": "<PREVIOUS_QUALITY_SCORE>",\
"new_quality_score": "<NEW_QUALITY_SCORE>",\
"message_template_id": <TEMPLATE_ID>,\
"message_template_name": "<TEMPLATE_NAME>",\
"message_template_language": "<TEMPLATE_LANGUAGE_AND_LOCALE_CODE>"\
},\
"field": "message_template_status_update"\
}\
]\
}\
],
"object": "whatsapp_business_account"
}
```
## Parameters
| Placeholder | Description | Example value |
| --- | --- | --- |
| `<NEW_QUALITY_SCORE>`<br>_String_ | New template [quality score](https://developers.facebook.com/documentation/business-messaging/whats

## message\_template\_status\_update webhook reference
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/message_template_status_update/

* * *
Resources
# message\_template\_status\_update webhook reference
Updated: Nov 14, 2025
This reference describes trigger events and payload contents for the WhatsApp Business Account `message_template_status_update` webhook.
The **message\_template\_status\_update** webhook notifies you of changes to the status of an existing template.
## Triggers
A template is approved.
A template is rejected.
A template is disabled.
## Syntax
```
{
"entry": [\
{\
"id": "<WHATSAPP_BUSINESS_ACCOUNT_ID>",\
"time": <WEBHOOK_TRIGGER_TIMESTAMP>,\
"changes": [\
{\
"value": {\
"event": "<EVENT>",\
"message_template_id": <TEMPLATE_ID>,\
"message_template_name": "<TEMPLATE_NAME>",\
"message_template_language": "<TEMPLATE_LANGUAGE_AND_LOCALE_CODE>",\
"reason": "<REASON>",\
"message_template_category": <TEMPLATE_CATEGORY>,\
\
<!-- only included if template disabled -->\
"disable_info": {\
"disable_date": "<DISABLE_TIMESTAMP>"\
},\
\
<!-- only included if template locked or unlocked -->\
"other_info": {\
"title": "<TITLE>",\
"description": "<DESCRIPTION>"\
}\
},\
\
<!-- only included if template rejected with INVALID_FORMAT reason -->\
"rejection_info": {\
"reason": "<REASON_INFO>",\
"recommendation": "<R

## messages webhook reference
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages/

* * *
Resources
# messages webhook reference
Updated: Oct 22, 2025
The **messages** webhook describes messages sent from a WhatsApp user to a business and the status of messages sent by a business to a WhatsApp user.
## Payload structures
### Incoming messages
Messages webhooks describing a message sent by a WhatsApp user — either directly, via an ad, or via a UI component in a previously received message — all have the same common structure. You can easily identify these webhooks because they include a `messages` array. For example, this webhook describes a text message sent a business:
```
{
"object": "whatsapp_business_account",
"entry": [\
{\
"id": "102290129340398",\
"changes": [\
{\
"value": {\
"messaging_product": "whatsapp",\
"metadata": {\
"display_phone_number": "15550783881",\
"phone_number_id": "106540352242922"\
},\
"contacts": [\
{\
"profile": {\
"name": "Sheena Nelson"\
},\
"wa_id": "16505551234"\
}\
],\
"messages": [\
{\
"from": "16505551234",\
"id": "wamid.HBgLMTY1MDM4Nzk0MzkVAgASGBQzQTRBNjU5OUFFRTAzODEwMTQ0RgA=",\
"timestamp": "1749416383",\
"type": "text"\
"text": {\
"body": "Does it come in another color?"\
}\
]\
},\
"field": "messages"\
}\
]\
}\
]
}
```
Objects

## Audio messages webhook reference
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages/audio/

* * *
Resources
# Audio messages webhook reference
Updated: Dec 11, 2025
Incoming media messages webhooks ( [image messages](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages/image), [video messages](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages/video), etc.) now include the media download URL (assigned to the `url` property) which you can query directly with your access token to download the incoming message’s media asset.
This reference describes trigger events and payload contents for the WhatsApp Business Account **messages** webhook for messages containing an audio recording.
## Triggers
A WhatsApp user sends a WhatsApp audio recording, or audio file, to a business.
A Whatsapp user sends a WhatsApp audio recording, or audio file, to a business via a Click to WhatsApp ad.
## Syntax
```
{
"object": "whatsapp_business_account",
"entry": [\
{\
"id": "<WHATSAPP_BUSINESS_ACCOUNT_ID>",\
"changes": [\
{\
"value": {\
"messaging_product": "whatsapp",\
"metadata": {\
"display_phone_number": "<BUSINESS_DISPLAY_PHONE_NUMBER>",\
"phone_number_id": "<BUSINESS_PHONE_NUMBER_ID>"\
},\
"co

## Button messages webhook reference
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages/button/

* * *
Resources
# Button messages webhook reference
Updated: Oct 22, 2025
This reference describes trigger events and payload contents for the WhatsApp Business Account **messages** webhook for quick-reply button messages.
## Triggers
A WhatsApp user taps a quick-reply button in a template message.
## Syntax
```
{
"object": "whatsapp_business_account",
"entry": [\
{\
"id": "<WHATSAPP_BUSINESS_ACCOUNT_ID>",\
"changes": [\
{\
"value": {\
"messaging_product": "whatsapp",\
"metadata": {\
"display_phone_number": "<BUSINESS_DISPLAY_PHONE_NUMBER>",\
"phone_number_id": "<BUSINESS_PHONE_NUMBER_ID>"\
},\
"contacts": [\
{\
"profile": {\
"name": "<WHATSAPP_USER_PROFILE_NAME>"\
},\
"wa_id": "<WHATSAPP_USER_ID>",\
"identity_key_hash": "<IDENTITY_KEY_HASH>" <!-- only included if identity change check enabled -->\
}\
],\
"messages": [\
{\
"context": {\
"from": "<BUSINESS_DISPLAY_PHONE_NUMBER>",\
"id": "<CONTEXTUAL_WHATSAPP_MESSAGE_ID>"\
},\
"from": "<WHATSAPP_USER_PHONE_NUMBER>",\
"id": "<WHATSAPP_MESSAGE_ID>",\
"timestamp": "<WEBHOOK_TRIGGER_TIMESTAMP>",\
"type": "button",\
"button": {\
"payload": "<BUTTON_LABEL_TEXT>",\
"text": "<BUTTON_LABEL_TEXT>"\
}\
]\
},\
"field": "messages"\
}\
]\
}\
]
}
`

## Contacts messages webhook reference
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages/contacts/

* * *
Resources
# Contacts messages webhook reference
Updated: Oct 22, 2025
This reference describes trigger events and payload contents for the WhatsApp Business Account **messages** webhook for messages containing one or more contacts.
## Triggers
A WhatsApp user sends one or more contacts to a business.
A Whatsapp user sends one or more contacts to a business via a Click to WhatsApp ad.
## Syntax
Note that many contact object properties may be omitted if the WhatsApp user chooses not to share them, or their device prevents them from being shared.
```
{
"object": "whatsapp_business_account",
"entry": [\
{\
"id": "<WHATSAPP_BUSINESS_ACCOUNT_ID>",\
"changes": [\
{\
"value": {\
"messaging_product": "whatsapp",\
"metadata": {\
"display_phone_number": "<BUSINESS_DISPLAY_PHONE_NUMBER>",\
"phone_number_id": "<BUSINESS_PHONE_NUMBER_ID>"\
},\
"contacts": [\
{\
"profile": {\
"name": "<WHATSAPP_USER_PROFILE_NAME>"\
},\
"wa_id": "<WHATSAPP_USER_ID>",\
"identity_key_hash": "<IDENTITY_KEY_HASH>" <!-- only included if identity change check enabled -->\
}\
],\
"messages": [\
{\
"from": "<WHATSAPP_USER_PHONE_NUMBER>",\
"id": "<WHATSAPP_MESSAGE_ID>",\
"timestamp": "<WEBHOOK_TRIGGER_TIMESTAMP>",\
"

## Document messages webhook reference
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages/document/

* * *
Resources
# Document messages webhook reference
Updated: Dec 11, 2025
Incoming media messages webhooks ( [image messages](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages/image), [video messages](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages/video), etc.) now include the media download URL (assigned to the `url` property) which you can query directly with your access token to download the incoming message’s media asset.
This reference describes trigger events and payload contents for the WhatsApp Business Account **messages** webhook for messages containing a document.
## Triggers
A WhatsApp user sends a document to a business.
A Whatsapp user sends a document to a business via a Click to WhatsApp ad.
## Syntax
```
{
"object": "whatsapp_business_account",
"entry": [\
{\
"id": "<WHATSAPP_BUSINESS_ACCOUNT_ID>",\
"changes": [\
{\
"value": {\
"messaging_product": "whatsapp",\
"metadata": {\
"display_phone_number": "<BUSINESS_DISPLAY_PHONE_NUMBER>",\
"phone_number_id": "<BUSINESS_PHONE_NUMBER_ID>"\
},\
"contacts": [\
{\
"profile": {\
"name": "<WHATSAPP_USER_PROFILE_NAME>"\

## Errors messages webhooks reference
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages/errors/

* * *
Resources
# Errors messages webhooks reference
Updated: Oct 22, 2025
This reference describes trigger events and payload contents for the WhatsApp Business Account **messages** webhook for errors messages.
## Triggers
We are unable to process a request due to a system level problem.
We are unable to process a request due to an app or account level problem.
## Syntax
```
{
"object": "whatsapp_business_account",
"entry": [\
{\
"id": "<WHATSAPP_BUSINESS_ACCOUNT_ID>",\
"changes": [\
{\
"value": {\
"messaging_product": "whatsapp",\
"metadata": {\
"display_phone_number": "<BUSINESS_DISPLAY_PHONE_NUMBER>",\
"phone_number_id": "<BUSINESS_PHONE_NUMBER_ID>"\
},\
"errors": [\
{\
"code": <ERROR_CODE>,\
"title": "<ERROR_TITLE>",\
"message": "<ERROR_MESSAGE>",\
"error_data": {\
"details": "<ERROR_DETAILS>"\
},\
"href": "<ERROR_CODES_URL>"\
}\
]\
},\
"field": "messages"\
}\
]\
}\
]
}
```
## Parameters
| Placeholder | Description | Example value |
| --- | --- | --- |
| `<BUSINESS_DISPLAY_PHONE_NUMBER>`<br>_String_ | Business display phone number. | `15550783881` |
| `<BUSINESS_PHONE_NUMBER_ID>`<br>_String_ | Business phone number ID. | `106540352242922` |
| `<ERROR_CODE>`<br>_Integer_ | [Err

## Group messages webhook reference
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages/group/

* * *
Resources
# Group messages webhook reference
Updated: Nov 10, 2025
This reference describes trigger events and payload contents for the WhatsApp Business Account **messages** webhook for messages that are sent to a group, or received from a group.
## Triggers
A WhatsApp user or a business sends a message to a group.
A Whatsapp user or a business receives a message within a group.
## Syntax
```
{
"object": "whatsapp_business_account",
"entry": [\
{\
"id": "<WHATSAPP_BUSINESS_ACCOUNT_ID>",\
"changes": [\
{\
"value": {\
"messaging_product": "whatsapp",\
"metadata": {\
"display_phone_number": "<BUSINESS_DISPLAY_PHONE_NUMBER>",\
"phone_number_id": "<BUSINESS_PHONE_NUMBER_ID>"\
},\
"contacts": [\
{\
"profile": {\
"name": "<WHATSAPP_USER_PROFILE_NAME>"\
},\
"wa_id": "<WHATSAPP_USER_ID>",\
"identity_key_hash": "<IDENTITY_KEY_HASH>" <!-- only included if identity change check enabled -->\
}\
],\
"messages": [\
{\
"from": "<WHATSAPP_USER_PHONE_NUMBER>",\
"group_id": "<GROUP_ID>",\
"id": "<WHATSAPP_MESSAGE_ID>",\
"timestamp": "<WEBHOOK_TRIGGER_TIMESTAMP>",\
"text": {\
"body": "<MESSAGE_TEXT_BODY>"\
},\
"type": "<MESSAGE_TYPE>"\
}\
],\
},\
"field": "messages"\
}\
]\
}\
]
}
```
## Paramet

## Image messages webhook reference
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages/image/

* * *
Resources
# Image messages webhook reference
Updated: Dec 11, 2025
Incoming media messages webhooks ( [image messages](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages/image), [video messages](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages/video), etc.) now include the media download URL (assigned to the `url` property) which you can query directly with your access token to download the incoming message’s media asset.
This reference describes trigger events and payload contents for the WhatsApp Business Account **messages** webhook for messages containing an image.
## Triggers
A WhatsApp user sends an image to a business.
A WhatsApp user forwards an image message to a business.
A WhatsApp user forwards an [interactive reply button message to a business](https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/interactive-reply-buttons-messages).
A Whatsapp user sends an image to a business via a Click to WhatsApp ad.
## Syntax
```
{
"object": "whatsapp_business_account",
"entry": [\
{\
"id": "<WHATSAPP_BUSINESS_ACCOUNT_ID>",\
"changes": [\
{\
"

## Interactive messages webhook reference
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages/interactive/

* * *
Resources
# Interactive messages webhook reference
Updated: Oct 22, 2025
This reference describes trigger events and payload contents for the WhatsApp Business Account **messages** webhook for replies to interactive messages.
## Triggers
A WhatsApp user taps a row in an [interactive list message](https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/interactive-list-messages).
A WhatsApp user taps a button in an [interactive reply button message](https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/interactive-reply-buttons-messages).
## Syntax
```
{
"object": "whatsapp_business_account",
"entry": [\
{\
"id": "<WHATSAPP_BUSINESS_ACCOUNT_ID>",\
"changes": [\
{\
"value": {\
"messaging_product": "whatsapp",\
"metadata": {\
"display_phone_number": "<BUSINESS_DISPLAY_PHONE_NUMBER>",\
"phone_number_id": "<BUSINESS_PHONE_NUMBER_ID>"\
},\
"contacts": [\
{\
"profile": {\
"name": "<WHATSAPP_USER_PROFILE_NAME>"\
},\
"wa_id": "<WHATSAPP_USER_ID>",\
"identity_key_hash": "<IDENTITY_KEY_HASH>" <!-- only included if identity change check enabled -->\
}\
],\
"messages": [\
{\
"context": {\
"from": "<BUSINESS_DISPLAY_PHONE_NUMBER>",\
"

## ## This page isn't available right now
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages/location/

## This page isn't available right now
This may be because of a technical error that we're working to get fixed. Try reloading this page.
Reload Page

## ## This page isn't available right now
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages/order/

## This page isn't available right now
This may be because of a technical error that we're working to get fixed. Try reloading this page.
Reload Page

## Reaction messages webhook reference
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages/reaction/

* * *
Resources
# Reaction messages webhook reference
Updated: Nov 14, 2025
This reference describes trigger events and payload contents for the WhatsApp Business Account **messages** webhook for messages containing a reaction to a previous message sent by a business.
**_Note:_** when an end user removes a reaction emoji, a webhook without the “emoji” field will be send as shown in the sample webhooks below
## Triggers
A WhatsApp user reacts to a previous message sent by a business within the last 30 days.
A WhatsApp user removes a previously sent reaction to a previous message sent by a business within the last 30 days
## Syntax
```
{
"object": "whatsapp_business_account",
"entry": [\
{\
"id": "<WHATSAPP_BUSINESS_ACCOUNT_ID>",\
"changes": [\
{\
"value": {\
"messaging_product": "whatsapp",\
"metadata": {\
"display_phone_number": "<BUSINESS_DISPLAY_PHONE_NUMBER>",\
"phone_number_id": "<BUSINESS_PHONE_NUMBER_ID>"\
},\
"contacts": [\
{\
"profile": {\
"name": "<WHATSAPP_USER_PROFILE_NAME>"\
},\
"wa_id": "<WHATSAPP_USER_ID>",\
"identity_key_hash": "<IDENTITY_KEY_HASH>" <!-- only included if identity change check enabled -->\
}\
],\
"messages": [\
{\
"from": "<WHATSAPP_USER_PHONE_NUMBER>

## Status messages webhook reference
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages/status/

* * *
Resources
# Status messages webhook reference
Updated: Nov 20, 2025
This reference describes trigger events and payload contents for WhatsApp Business Account status **messages** webhook.
## Triggers
Your message is sent to a WhatsApp user.
Your message is delivered to a WhatsApp user’s device.
Your message is displayed (i.e. “read”) in the WhatsApp client on a WhatsApp user’s device.
Your message is unable to be sent to a WhatsApp user.
Your message is unable to be delivered to a WhatsApp user’s device.
Your message is sent to a WhatsApp user in a group chat.
Your voice message is played by the WhatsApp user’s device.
Note that the triggers above also apply to a WhatsApp user who is part of a group chat.
A status is considered read only if it has been delivered. In some cases, like when a user receives a message while in the chat screen, the message is both delivered and read at the same time. In these cases, the “delivered” webhook is not sent because it’s implied that the message was delivered since it was read. This behavior is due to internal optimization.
## Syntax
```
{
"object": "whatsapp_business_account",
"entry": [\
{\
"id": "<WHATSAPP_BUSINESS_ACCOUNT_ID>",\
"chan

## ## This page isn't available right now
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages/sticker/

## This page isn't available right now
This may be because of a technical error that we're working to get fixed. Try reloading this page.
Reload Page

## ## This page isn't available right now
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages/system/

## This page isn't available right now
This may be because of a technical error that we're working to get fixed. Try reloading this page.
Reload Page

## Text messages webhook reference
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages/text/

* * *
Resources
# Text messages webhook reference
Updated: Oct 27, 2025
This reference describes trigger events and payload contents for the WhatsApp Business Account **messages** webhook for messages containing only text.
## Triggers
A WhatsApp user sends a text message to a WhatsApp business phone number.
A WhatsApp user forwards a text message to a business phone number.
A WhatsApp user uses the **Message business** button in a [catalog, single-, or multi-product message](https://developers.facebook.com/documentation/business-messaging/whatsapp/catalogs/sell-products-and-services) to send a message to the business.
A WhatsApp user sends a text message to a business via a [Click to WhatsApp ad](https://www.facebook.com/business/help/447934475640650?id=371525583593535) (an ad with a WhatsApp **message destination**).
## Syntax
```
{
"object": "whatsapp_business_account",
"entry": [\
{\
"id": "<WHATSAPP_BUSINESS_ACCOUNT_ID>",\
"changes": [\
{\
"value": {\
"messaging_product": "whatsapp",\
"metadata": {\
"display_phone_number": "<BUSINESS_DISPLAY_PHONE_NUMBER>",\
"phone_number_id": "<BUSINESS_PHONE_NUMBER_ID>"\
},\
"contacts": [\
{\
"profile": {\
"name": "<WHATSAPP_USER_PROFILE_NAME

## Unsupported messages webhook reference
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages/unsupported/

* * *
Resources
# Unsupported messages webhook reference
Updated: Nov 4, 2025
This reference describes trigger events and payload contents for the WhatsApp Business Account **messages** webhook for messages that are unsupported by the API.
## Triggers
A WhatsApp user sends a message type not supported by Cloud API.
A business uses the API to send a message to a number already in use with the API. In this case the webhook is sent to the owner of the recipient number.
## Syntax
```
{
"object": "whatsapp_business_account",
"entry": [\
{\
"id": "<WHATSAPP_BUSINESS_ACCOUNT_ID>",\
"changes": [\
{\
"value": {\
"messaging_product": "whatsapp",\
"metadata": {\
"display_phone_number": "<BUSINESS_DISPLAY_PHONE_NUMBER>",\
"phone_number_id": "<BUSINESS_PHONE_NUMBER_ID>"\
},\
"contacts": [\
{\
"profile": {\
"name": "<WHATSAPP_USER_PROFILE_NAME>"\
},\
"wa_id": "<WHATSAPP_USER_ID>",\
"identity_key_hash": "<IDENTITY_KEY_HASH>" <!-- only included if identity change check enabled -->\
}\
],\
"messages": [\
{\
"from": "<WHATSAPP_USER_PHONE_NUMBER>",\
"id": "<WHATSAPP_MESSAGE_ID>",\
"timestamp": "<WEBHOOK_TRIGGER_TIMESTAMP>",\
"errors": [\
{\
"code": 131051,\
"title": "Message type unknown",\
"message"

## Video messages webhook reference
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages/video/

* * *
Resources
# Video messages webhook reference
Updated: Dec 11, 2025
Incoming media messages webhooks ( [image messages](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages/image), [video messages](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages/video), etc.) now include the media download URL (assigned to the `url` property) which you can query directly with your access token to download the incoming message’s media asset.
This reference describes trigger events and payload contents for the WhatsApp Business Account **messages** webhook for messages containing a video.
## Triggers
A WhatsApp user sends a video to a business.
A WhatsApp user forwards a video to a business.
A Whatsapp user sends a video to a business via a Click to WhatsApp ad.
## Syntax
```
{
"object": "whatsapp_business_account",
"entry": [\
{\
"id": "<WHATSAPP_BUSINESS_ACCOUNT_ID>",\
"changes": [\
{\
"value": {\
"messaging_product": "whatsapp",\
"metadata": {\
"display_phone_number": "<BUSINESS_DISPLAY_PHONE_NUMBER>",\
"phone_number_id": "<BUSINESS_PHONE_NUMBER_ID>"\
},\
"contacts": [\
{\
"profile": {\
"nam

## partner\_solutions webhook reference
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/partner_solutions/

* * *
Resources
# partner\_solutions webhook reference
Updated: Oct 22, 2025
This reference describes trigger events and payload contents for the WhatsApp Business Account **partner\_solutions** webhook.
The **partner\_solutions webhook** describes changes to the status of a [Multi-Partner Solution](https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/multi-partner-solutions).
## Triggers
A multi-partner solution is saved as a draft.
A multi-partner solution request is sent to a partner.
A multi-partner solution partner accepts a solution request.
A multi-partner solution partner rejects a solution request.
A multi-partner solution partner requests deactivation of a solution.
A multi-partner solution is deactivated.
## Syntax
```
{
"entry": [\
{\
"changes": [\
{\
"field": "partner_solutions",\
"value": {\
"event": "<EVENT>",\
"solution_id": "<SOLUTION_ID>",\
"solution_status": "<SOLUTION_STATUS>"\
}\
],\
"id": "<BUSINESS_PORTFOLIO_ID>",\
"time": <WEBHOOK_TRIGGER_TIMESTAMP>\
}\
],
"object": "whatsapp_business_account"
}
```
## Parameters
| Placeholder | Description | Example value |
| --- | --- | --- |
| `<BUSINESS_PORTFOLIO_ID>`<br>_String_ |

## payment\_configuration\_update webhook reference
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/payment_configuration_update/

* * *
Resources
# payment\_configuration\_update webhook reference
Updated: Oct 22, 2025
This reference describes trigger events and payload contents for the WhatsApp Business Account **payment\_configuration\_update** webhook.
The **payment\_configuration\_update** webhook notifies you of changes to payment configurations for [Payments API India](https://developers.facebook.com/documentation/business-messaging/whatsapp/payments/payments-in/overview) and [Payments API Brazil](https://developers.facebook.com/documentation/business-messaging/whatsapp/payments/payments-br/overview).
## Triggers
The payment configuration associated with a WhatsApp Business Account has been connected to a payment gateway account.
The payment configuration associated with a WhatsApp Business Account has been disconnected from a payment gateway account.
The payment configuration associated with a WhatsApp Business Account is now active.
## Syntax
```
{
"entry": [\
{\
"id": "<WHATSAPP_BUSINESS_ACCOUNT_ID>",\
"time": <WEBHOOK_TRIGGER_TIMESTAMP>,\
"changes": [\
{\
"field": "payment_configuration_update",\
"value": {\
"configuration_name": "<PAYMENT_CONFIGURATION_NAME>",\
"provider_name": "PAYMENT_GATEWAY_PRO

## phone\_number\_name\_update webhook reference
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/phone_number_name_update/

* * *
Resources
# phone\_number\_name\_update webhook reference
Updated: Oct 22, 2025
This reference describes trigger events and payload contents for the WhatsApp Business Account **phone\_number\_name\_update** webhook.
The **phone\_number\_name\_update** webhook notifies you of business phone number [display name verification](https://developers.facebook.com/documentation/business-messaging/whatsapp/display-names#display-name-verificationn) outcomes.
## Triggers
A newly created business phone number’s display name is reviewed.
A business phone number’s already approved display name is edited and reviewed.
## Syntax
```
{
"entry": [\
{\
"id": "<WHATSAPP_BUSINESS_ACCOUNT_ID>",\
"time": <WEBHOOK_TRIGGER_TIMESTAMP>,\
"changes": [\
{\
"value": {\
"display_phone_number": "<BUSINESS_DISPLAY_PHONE_NUMBER>",\
"decision": "<DECISION>",\
"requested_verified_name": "<REQUESTED_DISPLAY_NAME>",\
"rejection_reason": "<REJECTION_REASON>"\
},\
"field": "phone_number_name_update"\
}\
]\
}\
],
"object": "whatsapp_business_account"
}
```
## Parameters
| Placeholder | Description | Example value |
| --- | --- | --- |
| `<BUSINESS_DISPLAY_PHONE_NUMBER>`<br>_String_ | Business display phone number. |

## phone\_number\_quality\_update webhook reference
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/phone_number_quality_update/

* * *
Resources
# phone\_number\_quality\_update webhook reference
Updated: Nov 14, 2025
This reference describes trigger events and payload contents for the WhatsApp Business Account **phone\_number\_quality\_update** webhook.
The **phone\_number\_quality\_update** webhook notifies you of changes to a business phone number’s [throughput level](https://developers.facebook.com/documentation/business-messaging/whatsapp/throughput).
## Triggers
A business phone number’s throughput level changes.
## Syntax
```
{
"entry": [\
{\
"id": "<WHATSAPP_BUSINESS_ACCOUNT_ID>",\
"time": <WEBHOOK_TRIGGER_TIMESTAMP>,\
"changes": [\
{\
"value": {\
"display_phone_number": "<BUSINESS_DISPLAY_PHONE_NUMBER>",\
"event": "<EVENT>",\
"old_limit": "<OLD_LIMIT>", <!-- only included for messaging limit changes -->\
"current_limit": "<CURRENT_LIMIT>",\
"max_daily_conversations_per_business": "<MAX_DAILY_MESSAGES_LIMIT>"\
},\
"field": "phone_number_quality_update"\
}\
]\
}\
],
"object": "whatsapp_business_account"
}
```
## Parameters
| Placeholder | Description | Example value |
| --- | --- | --- |
| `<BUSINESS_DISPLAY_PHONE_NUMBER>`<br>_String_ | Business display phone number. | `15550783881` |
| `<CURRENT_LIMI

## ## This page isn't available right now
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/security/

## This page isn't available right now
This may be because of a technical error that we're working to get fixed. Try reloading this page.
Reload Page

## smb\_app\_state\_sync webhook reference
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/smb_app_state_sync/

* * *
Resources
# smb\_app\_state\_sync webhook reference
Updated: Oct 22, 2025
This reference describes trigger events and payload contents for the WhatsApp Business Account **smb\_app\_state\_sync** webhook.
The **smb\_app\_state\_sync** webhook is used for synchronizing contacts of [WhatsApp Business app users who have been onboarded](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users) via a solution provider.
## Triggers
A solution provider [synchronizes the WhatsApp Business app contacts](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users#step-1--initiate-contacts-synchronization) of a business customer with a WhatsApp Business app phone number who the provider has [onboarded](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users).
A business customer with a WhatsApp Business app phone number who has been [onboarded](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users) by a solution provider adds a contact to

## smb\_message\_echoes webhook reference
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/smb_message_echoes/

* * *
Resources
# smb\_message\_echoes webhook reference
Updated: Oct 22, 2025
This reference describes trigger events and payload contents for the WhatsApp Business Account **smb\_message\_echoes** webhook.
The **smb\_message\_echoes** webhook notifies you of messages sent via the WhatsApp Business app or a [companion (“linked”) device](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users#linked-devices) by a business customer who has been [onboarded to Cloud API](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users) via a solution provider.
## Triggers
A business customer with a WhatsApp Business app phone number, who has been [onboarded by a solution provider](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users), sends a message using the WhatsApp Business app or a [companion device](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users#linked-devices) to a WhatsApp user or another business.
## Syntax
```
{
"object"

## template\_category\_update webhook reference
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/template_category_update/

* * *
Resources
# template\_category\_update webhook reference
Updated: Nov 11, 2025
This reference describes trigger events and payload contents for the WhatsApp Business Account **template\_category\_update** webhook.
The **template\_category\_update** webhook notifies you of changes to template’s [category](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-categorization).
## Triggers
The existing category of a WhatsApp template is going to be changed by an [automated process](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-categorization#how-we-update-a-template-s-category-after-initial-approval).
The existing category of a WhatsApp template is changed manually or by an [automated process](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-categorization#how-we-update-a-template-s-category-after-initial-approval).
## Syntax
```
{
"object": "whatsapp_business_account",
"entry": [\
{\
"id": "<WHATSAPP_BUSINESS_ACCOUNT_ID>",\
"time": <WEBHOOK_TRIGGER_TIMESTAMP>,\
"changes": [\
{\
"field": "template_category_update",\
"value": {\
"message_template_id": <

## ## This page isn't available right now
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/user_preferences/

## This page isn't available right now
This may be because of a technical error that we're working to get fixed. Try reloading this page.
Reload Page

## Create a test webhook endpoint
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/set-up-whatsapp-echo-bot/

* * *
Resources
# Create a test webhook endpoint
Updated: Nov 7, 2025
If you aren’t ready to create your own webhook endpoint yet, you can deploy a test webhook app on [Render.com](https://l.facebook.com/l.php?u=https%3A%2F%2Fwww.render.com%2F&h=AT1TqEkewXwAvLHPOOnIGK7B2n3n8hD7j9ccSELTuGdgMvjaJfzQ7t0hEKu-eTy-qP39GSGYCIRcqXF8hhrd9qoShLX-7W-qJH-mLXPA6MQgr9TapL5McIJZGspSMxvtQuwaMyeKUXoj0g) that accepts webhook requests and dumps their contents to Render’s console.
_Only use this app for testing purposes._
## Requirements
A [Render](https://l.facebook.com/l.php?u=https%3A%2F%2Fwww.render.com%2F&h=AT1TqEkewXwAvLHPOOnIGK7B2n3n8hD7j9ccSELTuGdgMvjaJfzQ7t0hEKu-eTy-qP39GSGYCIRcqXF8hhrd9qoShLX-7W-qJH-mLXPA6MQgr9TapL5McIJZGspSMxvtQuwaMyeKUXoj0g) account.
A [Github](https://l.facebook.com/l.php?u=https%3A%2F%2Fwww.github.com%2F&h=AT1TqEkewXwAvLHPOOnIGK7B2n3n8hD7j9ccSELTuGdgMvjaJfzQ7t0hEKu-eTy-qP39GSGYCIRcqXF8hhrd9qoShLX-7W-qJH-mLXPA6MQgr9TapL5McIJZGspSMxvtQuwaMyeKUXoj0g) account.
## Step 1: Create a Github repository
Sign into your Github account and create a new repo (public or private) with a name of your choice. Within the repo, create an `app.js` file and paste this code into it:
```
// Imp

## WhatsApp Business Accounts
Fonte: https://developers.facebook.com/documentation/business-messaging/whatsapp/whatsapp-business-accounts/

* * *
Resources
# WhatsApp Business Accounts
Updated: Oct 30, 2025
WhatsApp Business Accounts (“WABAs”) represent a business on the WhatsApp Business Platform. You must have a WABA to send and receive messages to and from WhatsApp users, and to create and manage templates.
There are several ways to create a WABA, which are described below. Once created, we recommend that you [connect your phone number](https://www.facebook.com/business/help/456220311516626) and [set up a payment method](https://www.facebook.com/business/help/2225184664363779).
## Limitations
A WhatsApp Business Account (WABA) can have a maximum of 250 message templates.
Meta Business Accounts are initially limited to 2 registered business phone numbers, but this limit can be increased to up to 20. See [Registered Number Limits](https://developers.facebook.com/documentation/business-messaging/whatsapp/business-phone-numbers/phone-numbers#registered-number-limits).
Meta Business Accounts are initially limited to 20 WABAs.
A WABA must belong to only one Business Manager. You cannot have two or more Business Managers owning one WABA.
A WABA’s time zone and currency cannot be edited once a line of credit has been attach

