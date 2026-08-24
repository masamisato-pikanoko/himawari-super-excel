class HimawariError(Exception): pass
class ValidationFailure(HimawariError): pass
class AuthorizationFailure(HimawariError): pass
class StaleHitlResponse(HimawariError): pass
class DuplicateEvent(HimawariError): pass
