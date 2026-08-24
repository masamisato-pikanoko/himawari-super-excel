import httpx, respx

@respx.mock
def test_weather_api_can_be_mocked():
    route=respx.get('https://weather.example.test/forecast').mock(return_value=httpx.Response(200,json={'rain_from':'13:30'}))
    response=httpx.get('https://weather.example.test/forecast')
    assert response.json()['rain_from']=='13:30'
    assert route.called
