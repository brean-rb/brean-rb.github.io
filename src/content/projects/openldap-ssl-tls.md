---
title: "OpenLDAP + SSL/TLS — Autenticación Centralizada"
stack: ["OpenLDAP", "SSL/TLS", "PKI", "SSSD", "Ubuntu Server"]
summary: "Despliegue de un servidor LDAP con cifrado TLS de extremo a extremo y autenticación centralizada de clientes Linux, simulando el entorno de un hospital."
date: 2025-11-15
draft: false
---

## El problema

Un hospital necesita que sus técnicos inicien sesión con las mismas credenciales en cualquier equipo de la red, sin que esas credenciales viajen nunca en texto plano. Esta guía monta esa infraestructura desde cero: un servidor OpenLDAP como directorio central, una CA propia para cifrar el tráfico con TLS, y un cliente Ubuntu que se autentica contra ese directorio de forma transparente.

Entorno simulado: organización `general-san.mylocal`.

## 1. Preparar la red

Antes de tocar LDAP, servidor y cliente tienen que reconocerse por nombre de dominio — los certificados dependen de que el FQDN coincida exactamente con la IP.

En el **servidor** (`192.168.1.142`):

```bash
sudo hostnamectl set-hostname general-ciber
sudo nano /etc/hosts
```

```
127.0.0.1 localhost
127.0.1.1 general-ciber
192.168.1.142 general.general-san.mylocal general
```

![Configuración de /etc/hosts en el servidor](/images/projects/openldap-ssl-tls/figura-1.jpg)

En el **cliente** (`192.168.1.143`), la misma lógica:

```bash
sudo hostnamectl set-hostname cliente-general
sudo nano /etc/hosts
```

```
127.0.0.1 localhost
127.0.1.1 cliente-general
192.168.1.142 general.general-san.mylocal general
```

![Configuración de /etc/hosts en el cliente](/images/projects/openldap-ssl-tls/figura-2.jpg)

Verifica que el cliente resuelve el servidor por nombre antes de seguir:

```bash
ping -c 4 general.general-san.mylocal
```

![Ping exitoso del cliente al servidor por FQDN](/images/projects/openldap-ssl-tls/figura-3.jpg)

Si esto falla, no continúes — todo lo que viene depende de esta resolución de nombres.

## 2. Instalar OpenLDAP

```bash
sudo apt update
sudo apt -y install slapd ldap-utils
sudo dpkg-reconfigure slapd
```

Durante el asistente:

| Pregunta | Respuesta |
|---|---|
| ¿Omitir configuración? | No |
| Dominio DNS | `general-san.mylocal` |
| Nombre de organización | `general-san` |
| ¿Borrar BD al purgar? | No |
| ¿Mover BD antigua? | Sí |

Verifica que el directorio base se creó bien:

```bash
sudo slapcat | grep "dn: dc=general-san,dc=mylocal"
```

![Verificación del dominio base del directorio](/images/projects/openldap-ssl-tls/figura-4.jpg)

### Activar logs de auditoría

Necesario para cumplir requisitos de trazabilidad. Se aplica en caliente con un LDIF:

```ldif
dn: cn=config
changeType: modify
replace: olcLogLevel
olcLogLevel: stats
```

```bash
sudo ldapmodify -Y EXTERNAL -H ldapi:/// -f loglevel.ldif
```

Redirige esos eventos a un archivo dedicado para facilitar el análisis:

```bash
echo "local4.* /var/log/slapd.log" | sudo tee -a /etc/rsyslog.d/51-slapd.conf
sudo systemctl restart rsyslog slapd
```

```bash
tail -n 10 /var/log/slapd.log
```

![Evidencia de accounting: el log muestra la actividad de slapd](/images/projects/openldap-ssl-tls/figura-5.jpg)

## 3. Cifrar el canal: PKI propia y TLS

Este es el paso que separa un LDAP de prácticas de uno defendible en producción: sin esto, las contraseñas viajan en texto plano por la red.

Crea una estructura de directorios protegida para certificados y claves:

```bash
sudo mkdir -p /etc/ssl/openldap/{private,certs,crl}
sudo chown -R openldap:openldap /etc/ssl/openldap
```

Genera la clave privada del servidor. Se protege temporalmente con contraseña y luego se elimina esa protección para que el servicio arranque solo, sin intervención manual:

```bash
sudo openssl genrsa -aes256 -out /etc/ssl/openldap/private/ldapserver.key 2048
sudo openssl rsa -in /etc/ssl/openldap/private/ldapserver.key \
  -out /etc/ssl/openldap/private/ldapserver.key
```

Genera la solicitud de firma (CSR) con los datos de la organización:

```bash
sudo openssl req -new-sha512 -key /etc/ssl/openldap/private/ldapserver.key \
  -out /etc/ssl/openldap/certs/ldapserver.csr
```

Datos introducidos: `C=ES, ST=Castellon, L=Castellon, O=General-Sanidad, OU=IT, CN=general.general-san.mylocal`.

Firma el certificado con la CA propia (previamente creada con easy-rsa):

```bash
cd /home/administrador/easy-rsa/
./easyrsa import-req /etc/ssl/openldap/certs/ldapserver.csr ldapserver
./easyrsa sign-req server ldapserver
```

Copia el certificado firmado y el certificado de la CA al directorio de OpenLDAP:

```bash
sudo cp pki/issued/ldapserver.crt /etc/ssl/openldap/certs/
sudo cp pki/ca.crt /etc/ssl/openldap/certs/
```

Ajusta permisos para que el usuario `openldap` pueda leer los certificados sin comprometer seguridad:

```bash
sudo apt install acl
sudo setfacl -m u:openldap:r-x /etc/ssl/openldap/certs/
sudo setfacl -m u:openldap:r-x /etc/ssl/openldap/private/
sudo setfacl -m u:openldap:r-x /etc/ssl/openldap/certs/ldapserver.crt
sudo setfacl -m u:openldap:r-x /etc/ssl/openldap/private/ldapserver.key
sudo setfacl -m u:openldap:r-x /etc/ssl/openldap/certs/ca.crt
```

Amplía el perfil de AppArmor en `/etc/apparmor.d/usr.sbin.slapd`:

```
/etc/ssl/openldap/certs/ r,
/etc/ssl/openldap/certs/* r,
/etc/ssl/openldap/private/ r,
/etc/ssl/openldap/private/* r,
```

```bash
sudo systemctl restart apparmor
```

Indica a OpenLDAP dónde están los certificados:

```ldif
dn: cn=config
changeType: modify
add: olcTLSCACertificateFile
olcTLSCACertificateFile: /etc/ssl/openldap/certs/ca.crt
-
add: olcTLSCertificateKeyFile
olcTLSCertificateKeyFile: /etc/ssl/openldap/private/ldapserver.key
-
add: olcTLSCertificateFile
olcTLSCertificateFile: /etc/ssl/openldap/certs/ldapserver.crt
```

```bash
sudo ldapmodify -Y EXTERNAL -H ldapi:/// -f ldap-tls.ldif
```

Activa el puerto seguro editando `/etc/default/slapd`:

```
SLAPD_SERVICES="ldap:/// ldapi:/// ldaps:///"
```

```bash
sudo systemctl restart slapd
sudo ss -tulpn | grep 636
```

![El proceso slapd escuchando en el puerto 636](/images/projects/openldap-ssl-tls/figura-6.jpg)

Confirma que la configuración TLS quedó cargada:

```bash
sudo slapcat -b "cn=config" | grep olcTLS
```

![Rutas a la CA, clave privada y certificado cargadas correctamente](/images/projects/openldap-ssl-tls/figura-7.jpg)

## 4. Poblar el directorio

Estructura organizativa: unidades (`ou=usuarios`, `ou=grupos`), un usuario técnico de solo lectura y un usuario final.

```ldif
dn: ou=usuarios,dc=general-san,dc=mylocal
objectClass: organizationalUnit
objectClass: top
ou: usuarios

dn: ou=grupos,dc=general-san,dc=mylocal
objectClass: organizationalUnit
objectClass: top
ou: grupos
```

ACL para que cada usuario gestione su propia contraseña y el usuario técnico pueda leer el directorio:

```ldif
dn: olcDatabase={1}mdb,cn=config
changetype: modify
replace: olcAccess
olcAccess: to attrs=userPassword,shadowLastChange,shadowExpire
 by self write
 by anonymous auth
 by dn.exact="cn=readonly,ou=usuarios,dc=general-san,dc=mylocal" read
 by * none
olcAccess: to dn.subtree="dc=general-san,dc=mylocal"
 by users read
 by * none
```

```bash
sudo ldapadd -Y EXTERNAL -H ldapi:/// -f update-mdb-acl.ldif
sudo ldapadd -Y EXTERNAL -H ldapi:/// -f users-ou.ldif
```

Usuario técnico y usuario final del hospital:

```ldif
dn: uid=juan.info,ou=usuarios,dc=general-san,dc=mylocal
objectClass: inetOrgPerson
objectClass: posixAccount
objectClass: shadowAccount
uid: juan.info
cn: Juan
sn: Info
loginShell: /bin/bash
uidNumber: 10000
gidNumber: 10000
homeDirectory: /home/juan.info
shadowLastChange: 0
```

```bash
sudo ldapadd -Y EXTERNAL -H ldapi:/// -f readonly-user.ldif
sudo ldapadd -Y EXTERNAL -H ldapi:/// -f usuario-informatica.ldif
sudo ldappasswd -H ldapi:/// -Y EXTERNAL -S \
  "uid=juan.info,ou=usuarios,dc=general-san,dc=mylocal"
```

Verifica la estructura completa:

```bash
sudo ldapsearch -Q -LLL -Y EXTERNAL -H ldapi:/// \
  -b "dc=general-san,dc=mylocal" dn
```

![Estructura del directorio: OUs, usuario técnico, grupo y usuario final](/images/projects/openldap-ssl-tls/figura-8.jpg)

## 5. Conectar el cliente con SSSD

El cliente necesita confiar en la CA y saber cómo autenticar contra el directorio.

Instala el certificado de la CA:

```bash
sudo nano /usr/local/share/ca-certificates/hospital-ca.crt
sudo update-ca-certificates
```

Instala y configura SSSD:

```bash
sudo apt update
sudo apt -y install sssd-ldap ldap-utils
```

```ini
[sssd]
services = nss, pam
config_file_version = 2
domains = general-san.mylocal

[domain/general-san.mylocal]
id_provider = ldap
auth_provider = ldap
ldap_uri = ldaps://general.general-san.mylocal
ldap_search_base = dc=general-san,dc=mylocal
ldap_default_bind_dn = cn=readonly,ou=usuarios,dc=general-san,dc=mylocal
ldap_default_authtok_type = password
ldap_default_authtok = readonly123

# Fuerza TLS — sin esto, SSSD podría degradar la conexión
ldap_tls_reqcert = demand
ldap_tls_cacert = /etc/ssl/certs/ca-certificates.crt

ldap_user_search_base = ou=usuarios,dc=general-san,dc=mylocal
ldap_group_search_base = ou=grupos,dc=general-san,dc=mylocal
ldap_user_object_class = inetOrgPerson
ldap_user_uid = uid

override_homedir = /home/%u
default_shell = /bin/bash
```

```bash
sudo chmod 600 /etc/sssd/sssd.conf
sudo systemctl restart sssd
sudo pam-auth-update
```

Marca "Create home directory on login" en el asistente de PAM.

Prueba que el cliente ve al usuario remoto:

```bash
id juan.info
su - juan.info
```

![Login exitoso: creación automática del home /home/juan.info](/images/projects/openldap-ssl-tls/figura-9.jpg)

Confirma que el usuario no existe localmente, solo vía LDAP:

```bash
grep "juan.info" /etc/passwd   # sin resultados
getent passwd juan.info         # sí devuelve datos
```

![grep no encuentra al usuario local; getent sí lo resuelve vía LDAP](/images/projects/openldap-ssl-tls/figura-10.jpg)

## 6. Bastionado final

Dos medidas cierran la práctica:

**Forzar solo conexiones cifradas** — se elimina el puerto LDAP sin cifrar del arranque del servicio:

```bash
# /etc/default/slapd
SLAPD_SERVICES="ldapi:/// ldaps:///"
```

```bash
sudo systemctl restart slapd
sudo ss -tulpn | grep slapd
```

![Solo el puerto 636 (LDAPS) queda escuchando; el 389 desaparece](/images/projects/openldap-ssl-tls/figura-11.jpg)

**Restringir enumeración de usuarios** — un usuario autenticado no debe poder listar a todos los demás:

```bash
sudo ldapmodify -Y EXTERNAL -H ldapi:/// -f restrict-access.ldif
```

Y en el cliente, en `/etc/sssd/sssd.conf`:

```ini
enumerate = false
```

## 7. Revocar un certificado (OCSP)

Un certificado firmado no es una garantía permanente — si una clave privada se compromete, hay que poder invalidarlo antes de que expire por sí solo. Esto se prueba con un mini servidor OCSP (Online Certificate Status Protocol) construido con la propia CA.

Levanta el respondedor OCSP usando la CA como firmante de las respuestas:

```bash
cd /home/administrador/easy-rsa/
openssl ocsp -index pki/index.txt -port 8888 \
  -rsigner pki/ca.crt -rkey pki/private/ca.key -CA pki/ca.crt -text
```

Este comando se queda escuchando — no cierres la terminal.

En otra terminal, consulta el estado actual del certificado de OpenLDAP:

```bash
sudo openssl ocsp -CAfile /home/administrador/easy-rsa/pki/ca.crt \
  -issuer /home/administrador/easy-rsa/pki/ca.crt \
  -cert /etc/ssl/openldap/certs/ldapserver.crt \
  -url http://127.0.0.1:8888 -resp_text
```

Busca la línea `Cert Status: good` en la respuesta.

![Consulta OCSP confirmando que el certificado está en estado válido](/images/projects/openldap-ssl-tls/figura-12-ocsp-valido.png)

Ahora revoca el certificado del servidor:

```bash
./easyrsa revoke ldapserver
./easyrsa gen-crl
```

La segunda orden regenera la lista de revocación (CRL) — sin esto, el respondedor OCSP no se entera del cambio.

![Confirmación de revocación exitosa](/images/projects/openldap-ssl-tls/figura-13-revocacion.png)

Repite la misma consulta OCSP de antes:

```bash
sudo openssl ocsp -CAfile pki/ca.crt -issuer pki/ca.crt \
  -cert /etc/ssl/openldap/certs/ldapserver.crt \
  -url http://127.0.0.1:8888 -resp_text
```

Ahora la línea dice `Cert Status: revoked`, con su fecha de revocación:

![Consulta OCSP confirmando que el certificado ahora aparece revocado](/images/projects/openldap-ssl-tls/figura-14-ocsp-revocado.png)

Con esto, la infraestructura PKI queda completa: no solo se puede emitir y usar un certificado, también se puede invalidar en caliente si algo sale mal.

## Resultado

- Autoridad de certificación propia cifrando todo el tráfico de autenticación.
- Servidor OpenLDAP rechazando cualquier conexión no cifrada (puerto 389 cerrado).
- Cliente Ubuntu autenticando usuarios LDAP como si fueran locales, con creación automática de home.
- Usuarios sin permiso para enumerar el resto del directorio.
- Capacidad de revocar un certificado comprometido y verificarlo en tiempo real vía OCSP.

## Por qué importa

La configuración por defecto de un servicio de directorio prioriza la compatibilidad, no la seguridad — el puerto sin cifrar está abierto salvo que lo cierres tú explícitamente. Este es el patrón general del bastionado: nada se asegura solo, cada superficie expuesta se cierra a mano y se verifica.
