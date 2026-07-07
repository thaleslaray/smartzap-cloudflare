# WhatsApp Contract (MVP)

Source of truth: `docs/whatsapp_indexed.jsonl` (extracted sections below).

## Scope for MVP
- Webhook verification (GET)
- Incoming messages payload (POST)
- Send message endpoint (/messages)
- Text message payload
- Response shape and delivery status note
- Throttling error code
- No-storage retry failure note

## Webhook Verification (GET)
URL: https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/set-up-whatsapp-echo-bot/

Sign into your Github account and create a new repo (public or private) with a name of your choice. Within the repo, create an `app.js` file and paste this code into it:

```
// Import Express.js
const express = require('express');

// Create an Express app
const app = express();

// Middleware to parse JSON bodies
app.use(express.json());

// Set port and verify_token
const port = process.env.PORT || 3000;
const verifyToken = process.env.VERIFY_TOKEN;

// Route for GET requests
app.get('/', (req, res) => {
  const { 'hub.mode': mode, 'hub.challenge': challenge, 'hub.verify_token': token } = req.query;

  if (mode === 'subscribe' && token === verifyToken) {
    console.log('WEBHOOK VERIFIED');
    res.status(200).send(challenge);
  } else {
    res.status(403).end();
  }
});

// Route for POST requests
app.post('/', (req, res) => {
  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
  console.log(`\n\nWebhook received ${timestamp}\n`);
  console.log(JSON.stringify(req.body, null, 2));
  res.status(200).end();
});

// Start the server
app.listen(port, () => {
  console.log(`\nListening on port ${port}\n`);
});
```

## Incoming Webhook Payload (POST)
URL: https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/webhooks/whatsapp-incoming-webhook-payload

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
            "messages": [\
              {\
                "from": "16505551234",\
                "id": "wamid.HBgLMTY1MDM4Nzk0MzkVAgASGBQzQTRBNjU5OUFFRTAzODEwMTQ0RgA=",\
                "timestamp": "1749416383",\
                "type": "text",\
                "text": {\
                  "body": "Does it come in another color?"\
                }\
              }\
            ]\

[truncated]

## Send Messages - Requests
URL: https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/send-messages/

All send message requests use the [**POST /<WHATSAPP\_BUSINESS\_PHONE\_NUMBER\_ID/messages**](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-phone-number/message-api) endpoint:

```
POST /<WHATSAPP_BUSINESS_PHONE_NUMBER_ID>/messages
```

The post body varies depending on the [type of message](https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/send-messages/#message-types) you want to send, but the payload uses the following common syntax:

```
{
  "messaging_product": "whatsapp",
  "recipient_type": "<RECIPIENT_TYPE>",
  "to": "<WHATSAPP_USER_PHONE_NUMBER>",
  "type": "<MESSAGE_TYPE>",
  "<MESSAGE_TYPE>": {<MESSAGE_CONTENTS>}
}
```

The `type` property value in the post body payload indicates the [type of message](https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/send-messages/#message-types) to send, and a property matching that type must be included that describes the message’s contents.

The `recipient_type` property can be either `indivudal` for 1:1 messaging, or `group` for group messages.

[Learn more about the Groups API](https://developers.facebook.com/doc

[truncated]

## Send Messages - Responses
URL: https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/send-messages/

The API will return the following JSON response if it successfully accepts your send message request without encountering any errors in the request itself. Note that this response only indicates that the API successfully **accepted your request**, it does not indicate successful delivery of your message. Message delivery status is communicated via **messages** webhooks instead.

## Send Messages - Response Syntax
URL: https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/send-messages/

```
{
  "messaging_product": "whatsapp",
  "contacts": [\
    {\
      "input": "<WHATSAPP_USER_PHONE_NUMBER>",\
      "wa_id": "<WHATSAPP_USER_ID>"\
    }\
  ],
  "messages": [\
    {\
      "id": "<WHATSAPP_MESSAGE_ID>",\
      "group_id": "<GROUP_ID>", <!-- Only included if messaging a group -->\
      "message_status": "<PACING_STATUS>" <!-- Only included if sending a template -->\
    }\
  ]
}
```

## Text Message - Request Syntax
URL: https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/text-messages/

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

## Text Message - Example Request
URL: https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/text-messages/

Example request to send a text message with link previews enabled and a body text string that contains a link.

```
curl 'https://graph.facebook.com/v24.0/106540352242922/messages' \
-H 'Content-Type: application/json' \
-H 'Authorization: Bearer EAAJB...' \
-d '
{
  "messaging_product": "whatsapp",
  "recipient_type": "individual",
  "to": "+16505551234",
  "type": "text",
  "text": {
    "preview_url": true,
    "body": "As requested, here'\''s the link to our latest product: https://www.meta.com/quest/quest-3/"
  }
}'
```

## Text Message - Example Response
URL: https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/text-messages/

```
{
  "messaging_product": "whatsapp",
  "contacts": [\
    {\
      "input": "+16505551234",\
      "wa_id": "16505551234"\
    }\
  ],
  "messages": [\
    {\
      "id": "wamid.HBgLMTY0NjcwNDM1OTUVAgARGBI1RjQyNUE3NEYxMzAzMzQ5MkEA"\
    }\
  ]
}
```

Did you find this page helpful?

![Thumbs up icon](https://static.xx.fbcdn.net/rsrc.php/yR/r/OEXJ0_DJeZv.svg)

![Thumbs down icon](https://static.xx.fbcdn.net/rsrc.php/yb/r/qKPgNVNeatU.svg)

ON THIS PAGE

Request syntax

Request parameters

Link preview

Example request

Example response

* * *

## Error Codes - Throttling
URL: https://developers.facebook.com/documentation/business-messaging/whatsapp/support/error-codes

| Code | Details | Possible reasons and solutions | HTTP Status Code |
| --- | --- | --- | --- |
| `4`<br>API Too Many Calls | The app has reached its API call rate limit. | Load the app in the [App Dashboard](https://developers.facebook.com/apps) and view the **Application Rate Limit** section to verify that the app has reached its [rate limit](https://developers.facebook.com/docs/graph-api/overview/rate-limiting#wa-biz-api). If it has, try again later or reduce the frequency or amount of API queries the app is making. | `400`<br>Bad Request |
| `80007`<br>Rate limit issues | The WhatsApp Business Account has reached its rate limit. | See WhatsApp Business Account [Rate Limits](https://developers.facebook.com/documentation/business-messaging/whatsapp/about-the-platform#rate-limits). Try again later or reduce the frequency or amount of API queries the app is making. | `400`<br>Bad Request |
| `130429`<br>Rate limit hit | Cloud API message throughput has been reached. | The app has reached the API’s throughput limit. See [Throughput](https://developers.facebook.com/documentation/business-messaging/whatsapp/throughput). Try again later or reduce the frequency with which the app sends

[truncated]

## No Storage - Retry Receipt Failures
URL: https://developers.facebook.com/documentation/business-messaging/whatsapp/no-storage/

In the case of WhatsApp client decryption failures, we will stop attempting to deliver an undelivared message from a No Storage-enabled number once the TTL is reached. In these cases, a [status messages](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages/status) webhook is triggered with error code `131036`:
