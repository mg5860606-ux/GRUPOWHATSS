exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers };

  const authHeader = event.headers.authorization;
  if (!authHeader) return { statusCode: 401, body: 'Missing Auth', headers };

  try {
    // Definir URL com base no mÃ©todo ou parÃ¢metros
    let targetUrl = 'https://api.promisse.com.br/transactions';
    
    // Se for uma requisiÃ§Ã£o GET, pode ser uma consulta de status
    if (event.httpMethod === 'GET' && event.queryStringParameters.id) {
        targetUrl += `/${event.queryStringParameters.id}`;
    }

    const response = await fetch(targetUrl, {
      method: event.httpMethod,
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json'
      },
      body: event.httpMethod === 'POST' ? event.body : undefined
    });

    const data = await response.json();
    return {
      statusCode: response.status,
      headers,
      body: JSON.stringify(data)
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: error.message })
    };
  }
};
